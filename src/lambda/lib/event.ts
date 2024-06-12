import type {
  EventClassState,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonRegistrationGroupInfo,
  JsonUser,
} from '../../types'

import {
  getRegistrationGroupKey,
  getRegistrationNumberingGroupKey,
  GROUP_KEY_CANCELLED,
  hasPriority,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { audit, registrationAuditKey } from './audit'

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

export const markParticipants = async (
  confirmedEvent: JsonConfirmedEvent,
  state: EventClassState,
  eventClass?: string
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

export const updateRegistrations = async (eventId: string, eventTable: string) => {
  const eventKey = { id: eventId }

  const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>(eventKey, eventTable)
  if (!confirmedEvent) {
    throw new Error(`Event with id "${eventId}" not found`)
  }

  const allRegistrations = await dynamoDB.query<JsonRegistration>(
    'eventId = :id',
    {
      ':id': eventId,
    },
    registrationTable
  )

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

  return confirmedEvent
}

export const saveGroup = async (
  { eventId, id, group }: JsonRegistrationGroupInfo,
  previous: JsonRegistrationGroupInfo['group'],
  user: JsonUser,
  reason: string = ''
) => {
  const registrationKey = { eventId, id }
  await dynamoDB.update(
    registrationKey,
    'set #grp = :value, #cancelled = :cancelled',
    {
      '#grp': 'group',
      '#cancelled': 'cancelled',
    },
    {
      ':value': { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
      ':cancelled': group?.key === GROUP_KEY_CANCELLED,
    },
    registrationTable
  )
  const oldGroupInfo = previous ? `${previous.key} #${previous.number} -> ` : ''
  await audit({
    auditKey: registrationAuditKey(registrationKey),
    user: user.name,
    message: `Ryhmä: ${oldGroupInfo}${group?.key} #${group?.number} ${reason}`.trim(),
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
