import type { EventClassState, JsonConfirmedEvent, JsonRegistration, JsonRegistrationGroupInfo } from '../../types'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

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

  const membershipPriority = (r: JsonRegistration) =>
    Boolean(confirmedEvent.priority?.includes('member') && (r.handler?.membership || r.owner?.membership))

  const classes = confirmedEvent.classes || []
  for (const cls of classes) {
    const regsToClass = registrations?.filter((r) => r.class === cls.class)
    cls.entries = regsToClass?.length
    cls.members = regsToClass?.filter((r) => membershipPriority(r)).length
  }
  const entries = registrations?.length || 0
  await dynamoDB.update(
    eventKey,
    'set #entries = :entries, #classes = :classes',
    {
      '#entries': 'entries',
      '#classes': 'classes',
    },
    {
      ':entries': entries,
      ':classes': classes,
    },
    eventTable
  )

  return confirmedEvent
}

const groupKey = <T extends JsonRegistration>(reg: T) => {
  if (reg.cancelled) {
    return 'cancelled'
  }
  return reg.group?.key ?? 'reserve'
}

const numberGroupKey = <T extends JsonRegistration>(reg: T) => {
  const ct = reg.class ?? reg.eventType
  if (reg.cancelled) {
    return 'cancelled-' + ct
  }
  if (reg.group?.date) {
    return 'participants' //`${reg.group?.date}-${ct}`
  }
  return 'reserve-' + ct
}

const byTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.group?.time === b.group?.time
    ? (a.group?.number || 999) - (b.group?.number || 999)
    : (a.group?.time ?? '').localeCompare(b.group?.time ?? '')

const byClassTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.class === b.class ? byTimeAndNumber(a, b) : (a.class ?? '').localeCompare(b.class ?? '')

const byDateClassTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.group?.date === b.group?.date
    ? byClassTimeAndNumber(a, b)
    : (a.group?.date ?? '').localeCompare(b.group?.date ?? '')

const saveGroup = ({ eventId, id, group }: JsonRegistrationGroupInfo) => {
  return dynamoDB.update(
    { eventId, id },
    'set #grp = :value, #cancelled = :cancelled',
    {
      '#grp': 'group',
      '#cancelled': 'cancelled',
    },
    {
      ':value': { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
      ':cancelled': group?.key === 'cancelled',
    },
    registrationTable
  )
}

export const fixRegistrationGroups = async <T extends JsonRegistration>(items: T[]): Promise<T[]> => {
  items.sort(byDateClassTimeAndNumber)

  const grouped: Record<string, T[]> = {}
  for (const item of items) {
    const groupKey = numberGroupKey(item)
    grouped[groupKey] = grouped[groupKey] || [] // make sure the array exists
    grouped[groupKey].push(item)
  }

  for (const regs of Object.values(grouped)) {
    for (let i = 0; i < regs.length; i++) {
      const reg = regs[i]
      const key = groupKey(reg)
      const number = i + 1
      if (reg.group?.key !== key || reg.group?.number !== number) {
        reg.group = { ...reg.group, key, number }
        await saveGroup(reg)
      }
    }
  }

  return items
}
