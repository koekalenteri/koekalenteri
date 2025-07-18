import type {
  ConfirmedEventStates,
  EventClassState,
  EventState,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonRegistration,
  JsonRegistrationGroupInfo,
  JsonUser,
  Registration,
} from '../../types'

import { addDays } from 'date-fns'

import { formatDate, zonedStartOfDay } from '../../i18n/dates'
import {
  getRegistrationGroupKey,
  getRegistrationNumberingGroupKey,
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  hasPriority,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { isDefined } from '../../lib/typeGuards'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { audit, registrationAuditKey } from './audit'
import { broadcastEvent } from './broadcast'
import { LambdaError } from './lambda'

type EventEntryEndDates = Pick<JsonDogEvent, 'id' | 'entryEndDate' | 'entryOrigEndDate'>

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

const EVENT_CLASS_STATES: EventClassState[] = ['picked', 'invited', 'started', 'ended'] as const
const EVENT_STATES: EventState[] = ['confirmed', ...EVENT_CLASS_STATES] as const

export const getEvent = async <T extends JsonDogEvent = JsonDogEvent>(id: string): Promise<T> => {
  const jsonEvent = await dynamoDB.read<T>({ id }, eventTable)
  if (!jsonEvent) {
    throw new LambdaError(404, `Event with id '${id}' was not found`)
  }

  return jsonEvent
}

export const findQualificationStartDate = async (
  eventType: string,
  entryEndDate: string
): Promise<string | undefined> => {
  const result = await dynamoDB.query<EventEntryEndDates>({
    key: 'eventType = :eventType AND entryEndDate < :entryEndDate',
    values: { ':eventType': eventType, ':entryEndDate': entryEndDate },
    table: CONFIG.eventTable,
    index: 'gsiEventTypeEntryEndDate',
    forward: false,
    limit: 1,
  })

  if (result && result.length === 1 && result[0].entryEndDate) {
    const date = new Date(result[0].entryOrigEndDate ?? result[0].entryEndDate)
    const qualificationStartDate = zonedStartOfDay(addDays(date, 1))
    return qualificationStartDate.toISOString()
  }
}

export const saveEvent = async (data: JsonDogEvent) => dynamoDB.write(data, eventTable)

/**
 * Map template name to a valid EventClassState
 */
export const getStateFromTemplate = (template: string): EventClassState => {
  if (template === 'invitation') return 'invited'
  if (template === 'picked') return 'picked'

  // Default to 'picked' for any other template
  // This is a fallback that shouldn't happen in normal operation
  return 'picked'
}

export const upgradeClassState = (
  oldState: EventClassState | undefined,
  newState: EventClassState
): EventClassState => {
  if (!oldState) return newState
  const oldIndex = EVENT_CLASS_STATES.indexOf(oldState)
  const newIndex = EVENT_CLASS_STATES.indexOf(newState)

  return oldIndex < newIndex ? newState : oldState
}

export const upgradeEventState = (
  oldState: ConfirmedEventStates | undefined,
  newState: ConfirmedEventStates
): ConfirmedEventStates => {
  if (!oldState) return newState
  const oldIndex = EVENT_STATES.indexOf(oldState)
  const newIndex = EVENT_STATES.indexOf(newState)

  return oldIndex < newIndex ? newState : oldState
}

export const markParticipants = async (
  confirmedEvent: JsonConfirmedEvent,
  state: EventClassState,
  eventClass?: Registration['class']
) => {
  const eventKey = { id: confirmedEvent.id }
  let allInvited = true
  if (eventClass) {
    for (const c of confirmedEvent.classes) {
      if (c.class === eventClass) {
        c.state = upgradeClassState(c.state, state)
      }
    }
    allInvited = confirmedEvent.classes.filter((c) => c.state === state).length === confirmedEvent.classes.length
  }
  if (allInvited) {
    confirmedEvent.state = upgradeEventState(confirmedEvent.state, state)
  }

  await dynamoDB.update(
    eventKey,
    {
      set: {
        classes: confirmedEvent.classes,
        state: confirmedEvent.state,
      },
    },
    eventTable
  )

  return confirmedEvent
}

export const updateRegistrations = async (eventId: string, updatedRegistrations?: JsonRegistration[]) => {
  const eventKey = { id: eventId }

  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  if (!confirmedEvent) {
    throw new LambdaError(404, `Event with id "${eventId}" not found`)
  }

  const allRegistrations =
    updatedRegistrations ??
    (await dynamoDB.query<JsonRegistration>({
      key: 'eventId = :id',
      values: { ':id': eventId },
      table: registrationTable,
    }))

  // ignore cancelled or unpaid registrations
  const registrations = allRegistrations?.filter((r) => r.state === 'ready' && !r.cancelled)

  const priorityFilter = (r: JsonRegistration) => hasPriority(confirmedEvent, r)

  let classesChanged = false
  const classes = confirmedEvent.classes || []
  for (const cls of classes) {
    const regsToClass = registrations?.filter((r) => r.class === cls.class)
    const entries = regsToClass?.length
    const members = regsToClass?.filter(priorityFilter).length

    if (entries !== cls.entries || members != cls.members) {
      cls.entries = entries
      cls.members = members
      classesChanged = true
    }
  }
  const entries = registrations?.length ?? 0
  const members = registrations?.filter(priorityFilter).length ?? 0

  // avoid noop updates
  if (!classesChanged && confirmedEvent.entries === entries && confirmedEvent.members === members) {
    return confirmedEvent
  }

  await dynamoDB.update(
    eventKey,
    {
      set: {
        entries,
        members,
        classes,
      },
    },
    eventTable
  )

  confirmedEvent.entries = entries
  confirmedEvent.members = members

  await broadcastEvent({ eventId, classes, entries, members })

  return confirmedEvent
}

export const formatGroupAuditInfo = (group: JsonRegistrationGroupInfo['group']): string => {
  if (!group) return ''

  if (group.key === GROUP_KEY_CANCELLED) return `Peruneet #${group.number}`
  if (group.key === GROUP_KEY_RESERVE) return `Ilmoittautuneet #${group.number}`

  const groupKey = [group.date && formatDate(group.date, 'eeeeee d.M.'), group.time].filter(isDefined).join(' ')

  return `${groupKey} #${group.number}`
}

export const saveGroup = async (
  { eventId, id, group }: JsonRegistrationGroupInfo,
  previous: JsonRegistrationGroupInfo['group'],
  user: JsonUser,
  reason: string = '',
  cancelReason?: string
) => {
  const registrationKey = { eventId, id }
  const cancelled = group?.key === GROUP_KEY_CANCELLED
  if (cancelled && cancelReason) {
    await dynamoDB.update(
      registrationKey,
      {
        set: {
          group: { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
          cancelled,
          cancelReason,
        },
      },
      registrationTable
    )
  } else {
    await dynamoDB.update(
      registrationKey,
      {
        set: {
          group: { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
          cancelled,
        },
      },
      registrationTable
    )
  }
  const oldGroupInfo = previous ? `${formatGroupAuditInfo(previous)} -> ` : ''
  await audit({
    auditKey: registrationAuditKey(registrationKey),
    user: user.name,
    message: `Ryhmä: ${oldGroupInfo}${formatGroupAuditInfo(group)} ${reason}`.trim(),
  })
}

export const fixRegistrationGroups = async <T extends JsonRegistration>(
  items: T[],
  user: JsonUser,
  save: boolean = true
): Promise<T[]> => {
  items.sort(sortRegistrationsByDateClassTimeAndNumber)

  const numberingGroups: Record<string, T[]> = {}
  for (const item of items) {
    const numberingGroupKey = getRegistrationNumberingGroupKey(item)
    numberingGroups[numberingGroupKey] = numberingGroups[numberingGroupKey] || [] // make sure the array exists
    numberingGroups[numberingGroupKey].push(item)
  }

  for (const regs of Object.values(numberingGroups)) {
    for (let i = 0; i < regs.length; i++) {
      const reg = regs[i]
      const key = getRegistrationGroupKey(reg)
      const number = i + 1
      if (reg.group?.key !== key || reg.group?.number !== number) {
        const oldGroup = reg.group
        reg.group = { ...reg.group, key, number }
        if (save) {
          await saveGroup(reg, oldGroup, user, '(automaattinen sijoitus)')
        }
      }
    }
  }

  return items
}
