import type {
  EventClassState,
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
import { LambdaError } from './lambda'

const { eventTable, eventStatsTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

export const getEvent = async <T extends JsonDogEvent = JsonDogEvent>(id: string): Promise<T> => {
  const jsonEvent = await dynamoDB.read<T>({ id }, eventTable)
  if (!jsonEvent) {
    throw new LambdaError(404, `Event with id '${id}' was not found`)
  }

  return jsonEvent
}

type EventEntryEndDates = Pick<JsonDogEvent, 'id' | 'entryEndDate' | 'entryOrigEndDate'>

export const findQualificationStartDate = async (
  eventType: string,
  entryEndDate: string
): Promise<string | undefined> => {
  const result = await dynamoDB.query<EventEntryEndDates>(
    'eventType = :eventType AND entryEndDate < :entryEndDate',
    { ':eventType': eventType, ':entryEndDate': entryEndDate },
    CONFIG.eventTable,
    'gsiEventTypeEntryEndDate',
    undefined,
    false,
    1
  )

  if (result && result.length === 1 && result[0].entryEndDate) {
    const date = new Date(result[0].entryOrigEndDate || result[0].entryEndDate)
    const qualificationStartDate = zonedStartOfDay(addDays(date, 1))
    return qualificationStartDate.toISOString()
  }
}

export const saveEvent = async (data: JsonDogEvent) => dynamoDB.write(data, eventTable)

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
        c.state = state
      }
    }
    allInvited = confirmedEvent.classes.filter((c) => c.state === state).length === confirmedEvent.classes.length
  }
  if (allInvited) {
    confirmedEvent.state = state
  }

  await dynamoDB.update(
    eventKey,
    'set #classes = :classes, #state = :state',
    {
      '#classes': 'classes',
      '#state': 'state',
    },
    {
      ':classes': confirmedEvent.classes,
      ':state': confirmedEvent.state,
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
    (await dynamoDB.query<JsonRegistration>(
      'eventId = :id',
      {
        ':id': eventId,
      },
      registrationTable
    ))

  // ignore cancelled or unpaid registrations
  const registrations = allRegistrations?.filter((r) => r.state === 'ready' && !r.cancelled)

  const priorityFilter = (r: JsonRegistration) => hasPriority(confirmedEvent, r)

  const classes = confirmedEvent.classes || []
  for (const cls of classes) {
    const regsToClass = registrations?.filter((r) => r.class === cls.class)
    cls.entries = regsToClass?.length
    cls.members = regsToClass?.filter(priorityFilter).length
  }
  const entries = registrations?.length ?? 0
  const members = registrations?.filter(priorityFilter).length ?? 0
  await dynamoDB.update(
    eventKey,
    'set #entries = :entries, #members = :members, #classes = :classes',
    {
      '#entries': 'entries',
      '#members': 'members',
      '#classes': 'classes',
    },
    {
      ':entries': entries,
      ':members': members,
      ':classes': classes,
    },
    eventTable
  )

  confirmedEvent.entries = entries
  confirmedEvent.members = members

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
      'set #grp = :value, #cancelled = :cancelled, #cancelReason = :cancelReason',
      {
        '#grp': 'group',
        '#cancelled': 'cancelled',
        '#cancelReason': 'cancelReason',
      },
      {
        ':value': { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
        ':cancelled': cancelled,
        ':cancelReason': cancelReason,
      },
      registrationTable
    )
  } else {
    await dynamoDB.update(
      registrationKey,
      'set #grp = :value, #cancelled = :cancelled',
      {
        '#grp': 'group',
        '#cancelled': 'cancelled',
      },
      {
        ':value': { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
        ':cancelled': cancelled,
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
          await saveGroup(reg, oldGroup, user, '(seuraus)')
        }
      }
    }
  }

  return items
}
