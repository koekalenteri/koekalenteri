import type {
  ConfirmedEventStates,
  EventClassState,
  EventState,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonRegistration,
  JsonRegistrationGroupInfo,
  JsonUser,
  Patch,
  Registration,
} from '../../types'
import { randomUUID } from 'node:crypto'
import { addDays } from 'date-fns'
import { formatDate, zonedStartOfDay } from '../../i18n/dates'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE, hasPriority } from '../../lib/registration'
import { normalizeRegistrationGroups } from '../../lib/registrationGroups'
import { isDefined } from '../../lib/typeGuards'
import { CONFIG } from '../config'
import { publishAdminEventPatch, publishEventPatch, publishPublicEvent } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { audit, registrationAuditKey } from './audit'
import { LambdaError } from './lambda'
import { createPatch } from './patch'
import { createRegistrationPatches, getReadyRegistrationsByEventId, getRegistrationsByEventId } from './registration'

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
    forward: false,
    index: 'gsiEventTypeEntryEndDate',
    key: 'eventType = :eventType AND entryEndDate < :entryEndDate',
    limit: 1,
    table: CONFIG.eventTable,
    values: { ':entryEndDate': entryEndDate, ':eventType': eventType },
  })

  if (result?.length === 1 && result[0]?.entryEndDate) {
    const date = new Date(result[0].entryOrigEndDate ?? result[0].entryEndDate)
    const qualificationStartDate = zonedStartOfDay(addDays(date, 1))
    return qualificationStartDate.toISOString()
  }
}

export const saveEvent = async (data: JsonDogEvent) => {
  await dynamoDB.write(data, eventTable)

  const patch = { ...data, eventId: data.id }
  if (data.state === 'draft') {
    await publishAdminEventPatch(patch, data.organizer.id)
  } else {
    await publishEventPatch(patch, data.organizer.id)
  }
}

export const patchEvent = async (
  eventId: string,
  existing: JsonDogEvent,
  next: JsonDogEvent
): Promise<JsonDogEvent> => {
  const { changes, remove, set } = createPatch(next, existing)
  const becomesPublic = existing.state === 'draft' && next.state !== 'draft'
  const staysDraft = existing.state === 'draft' && next.state === 'draft'

  if (!set && !remove) {
    return existing
  }

  await dynamoDB.update(
    { id: eventId },
    {
      ...(set ? { set } : {}),
      ...(remove ? { remove } : {}),
    },
    eventTable
  )

  if (staysDraft) {
    await publishAdminEventPatch({ eventId, ...changes }, next.organizer.id)
  } else {
    await publishEventPatch({ eventId, ...(becomesPublic ? next : changes) }, next.organizer.id)
  }

  return getEvent<JsonDogEvent>(eventId)
}

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

  // Sending invitations must not implicitly publish the start list. Keep any
  // publication choice already made by the secretary.
  if (state === 'invited' && confirmedEvent.startListPublished === undefined) {
    confirmedEvent.startListPublished = false
  }

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
        ...(state === 'invited' ? { startListPublished: confirmedEvent.startListPublished } : {}),
        updatedAt: new Date().toISOString(),
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

  const allRegistrations = updatedRegistrations ?? (await getRegistrationsByEventId(eventId))

  // ignore cancelled or unpaid registrations
  const registrations = allRegistrations?.filter((r) => r.state === 'ready' && !r.cancelled)

  const priorityFilter = (r: JsonRegistration) => hasPriority(confirmedEvent, r)

  let classesChanged = false
  const classes = confirmedEvent.classes || []
  for (const cls of classes) {
    const regsToClass = registrations?.filter((r) => r.class === cls.class)
    const entries = regsToClass?.length
    const members = regsToClass?.filter(priorityFilter).length

    if (entries !== cls.entries || members !== cls.members) {
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

  const updatedAt = new Date().toISOString()

  await dynamoDB.update(
    eventKey,
    {
      set: {
        classes,
        entries,
        members,
        updatedAt,
      },
    },
    eventTable
  )

  confirmedEvent.entries = entries
  confirmedEvent.members = members
  confirmedEvent.updatedAt = updatedAt

  await publishPublicEvent({ entries, eventId, members, updatedAt })
  await publishAdminEventPatch({ classes, entries, eventId, members, updatedAt }, confirmedEvent.organizer.id)

  return confirmedEvent
}

const EVENT_WORKFLOW_LOCK_DURATION_MS = 90 * 1000

type EventWorkflowLock = 'registrationGroupsLock' | 'registrationPaymentsLock'

const lockEventWorkflow = async (
  eventId: string,
  field: EventWorkflowLock,
  retries: number,
  conflictMessage: string
): Promise<() => Promise<void>> => {
  const token = randomUUID()
  const lockName = `#${field}`
  for (let attempt = 0; ; attempt++) {
    const now = Date.now()
    try {
      await dynamoDB.update(
        { id: eventId },
        { set: { [field]: { expiresAt: now + EVENT_WORKFLOW_LOCK_DURATION_MS, token } } },
        eventTable,
        undefined,
        {
          expression: `attribute_exists(#id) AND (attribute_not_exists(${lockName}) OR ${lockName}.#expiresAt < :now)`,
          names: { '#expiresAt': 'expiresAt', '#id': 'id', [lockName]: field },
          values: { ':now': now },
        }
      )
      break
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      if (attempt >= retries) throw new LambdaError(409, conflictMessage)
      const delayMs = Math.min(100 * 2 ** attempt, 1000)
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return async () => {
    try {
      await dynamoDB.update({ id: eventId }, { remove: [field] }, eventTable, undefined, {
        expression: `${lockName}.#token = :token`,
        names: { [lockName]: field, '#token': 'token' },
        values: { ':token': token },
      })
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
    }
  }
}

/**
 * Serializes manual registration-group moves for one event. A move recalculates
 * every affected position, so allowing two snapshots to be persisted at once
 * can otherwise make one move overwrite the other.
 */
export const lockRegistrationGroups = async (eventId: string, retries: number = 0): Promise<() => Promise<void>> => {
  return lockEventWorkflow(
    eventId,
    'registrationGroupsLock',
    retries,
    'Registration groups are being updated. Please retry.'
  )
}

/** Serializes only payment transitions for one event; group moves never block it. */
export const lockRegistrationPayments = (eventId: string, retries: number = 8) =>
  lockEventWorkflow(
    eventId,
    'registrationPaymentsLock',
    retries,
    'Registration payments are being updated. Please retry.'
  )

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
  user: Pick<JsonUser, 'name'>,
  reason: string = '',
  cancelReason?: string
) => {
  const registrationKey = { eventId, id }
  const cancelled = group?.key === GROUP_KEY_CANCELLED
  const updatedAt = new Date().toISOString()
  if (cancelled && cancelReason) {
    await dynamoDB.update(
      registrationKey,
      {
        set: {
          cancelled,
          cancelReason,
          group: { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
          updatedAt,
        },
      },
      registrationTable
    )
  } else {
    await dynamoDB.update(
      registrationKey,
      {
        set: {
          cancelled,
          group: { ...group }, // https://stackoverflow.com/questions/37006008/typescript-index-signature-is-missing-in-type
          updatedAt,
        },
        ...(previous?.key === GROUP_KEY_CANCELLED && !cancelled ? { remove: ['cancelReason'] } : {}),
      },
      registrationTable
    )
  }
  const oldGroupInfo = previous ? `${formatGroupAuditInfo(previous)} -> ` : ''
  await audit({
    auditKey: registrationAuditKey(registrationKey),
    message: `Ryhmä: ${oldGroupInfo}${formatGroupAuditInfo(group)} ${reason}`.trim(),
    user: user.name,
  })
}

export const fixRegistrationGroups = async <T extends JsonRegistration>(
  items: T[],
  user: Pick<JsonUser, 'name'>,
  save: boolean = true
): Promise<T[]> => {
  const previousGroups = new Map(items.map((item) => [item, item.group ? { ...item.group } : undefined]))
  normalizeRegistrationGroups(items)

  for (const registration of items) {
    const previous = previousGroups.get(registration)
    if (registration.group?.key !== previous?.key || registration.group?.number !== previous?.number) {
      if (save) {
        await saveGroup(registration, previous, user, '(automaattinen sijoitus)')
      }
    }
  }

  return items
}

/** Repairs and persists the ready-registration ordering under the event lock. */
export const repairReadyRegistrationGroups = async (
  eventId: string,
  user: Pick<JsonUser, 'name'>
): Promise<Patch<JsonRegistration>[]> => {
  const releaseGroupsLock = await lockRegistrationGroups(eventId, 8)
  try {
    const readyRegistrations = await getReadyRegistrationsByEventId(eventId, true)
    const beforeReconciliation = readyRegistrations.map((registration) => ({
      ...registration,
      ...(registration.group ? { group: { ...registration.group } } : {}),
    }))
    const repairedRegistrations = await fixRegistrationGroups(readyRegistrations, user)
    return createRegistrationPatches(repairedRegistrations, beforeReconciliation)
  } finally {
    await releaseGroupsLock()
  }
}
