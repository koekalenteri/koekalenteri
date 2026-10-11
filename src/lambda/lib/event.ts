import type { AuditActor, GroupChangeReason } from '../../lib/audit'
import type {
  ClassOrNone,
  ConfirmedEventStates,
  EventClassState,
  EventState,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonLinkedEvent,
  JsonRegistration,
  JsonRegistrationGroupInfo,
  Patch,
  Registration,
  RegistrationClass,
  ResultsPublishedState,
} from '../../types'
import { randomUUID } from 'node:crypto'
import { addDays } from 'date-fns/addDays'
import { zonedStartOfDay } from '../../i18n/dates'
import { auditUser, groupChangeAudit } from '../../lib/audit'
import { isResultsPublishedClassMap, withResultsDay } from '../../lib/event'
import { getResultsBlocker, isResultsPublishedState } from '../../lib/publishing'
import { GROUP_KEY_CANCELLED, hasPriority, REGISTRATION_WRITE_CONCURRENCY } from '../../lib/registration'
import { normalizeRegistrationGroups } from '../../lib/registrationGroups'
import { mapWithConcurrency } from '../../lib/utils'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { audit, registrationAuditKey } from './audit'
import { foldedFrom, retryOnConditionFailure } from './conditionalWrite'
import { httpError, LambdaError } from './lambda'
import { createPatch } from './patch'
import { createRegistrationPatches, getReadyRegistrationsByEventId, getRegistrationsByEventId } from './registration'

type EventEntryEndDates = Pick<JsonDogEvent, 'id' | 'entryEndDate' | 'entryOrigEndDate'>

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

/**
 * Event fields the published start list is derived from. Every other event change reaches an open
 * reader as the broadcast public event patch and needs no rebuilt list.
 */
const START_LIST_EVENT_FIELDS = [
  'classes',
  'resultsPublished',
  'startListPublished',
  'startNumbersPublished',
  'state',
] as const

export const affectsPublicStartList = (patch: object) => START_LIST_EVENT_FIELDS.some((field) => field in patch)

/**
 * What changed about an event, for whoever sends it on. The domain decides what happened and who
 * may see it; broadcasting is the handler's job, through `publishEventChange` -- which is what
 * keeps the WebSocket sender, and the AWS SDK behind it, out of the lambdas that only save.
 */
export interface EventChange {
  /** A draft event is the organizer's business alone until it is published. */
  audience: 'admin' | 'public'
  organizerId: string
  patch: Patch<JsonDogEvent> & { eventId: string }
  /** The event whose published start list changed with it, if any. */
  startList?: JsonDogEvent
}

const EVENT_CLASS_STATES: EventClassState[] = ['picked', 'invited', 'started', 'ended'] as const
const EVENT_STATES: EventState[] = ['confirmed', ...EVENT_CLASS_STATES] as const

/** `consistent` reads the row as last written, for a caller about to write back what it folds from it. */
export const getEvent = async <T extends JsonDogEvent = JsonDogEvent>(id: string, consistent = false): Promise<T> => {
  const jsonEvent = await dynamoDB.read<T>({ id }, eventTable, consistent)
  if (!jsonEvent) {
    throw new LambdaError(404, `Event with id '${id}' was not found`)
  }

  return jsonEvent
}

export const findEventWithKcId = async (
  kcId: number,
  excludeId?: string
): Promise<Pick<JsonDogEvent, 'id'> | undefined> => {
  const matches = await dynamoDB.readAll<Pick<JsonDogEvent, 'id'>>({
    filter: 'kcId = :kcId',
    projection: 'id',
    table: eventTable,
    values: { ':kcId': kcId },
  })
  return matches?.find((match) => match.id !== excludeId)
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

export const saveEvent = async (data: JsonDogEvent): Promise<EventChange> => {
  await dynamoDB.write(data, eventTable)

  const patch = { ...data, eventId: data.id }
  if (data.state === 'draft') {
    return { audience: 'admin', organizerId: data.organizer.id, patch }
  }

  // The publication flags live on the event, so publishing or hiding the list changes what its
  // readers may see without any registration changing (KOE-1358).
  return { audience: 'public', organizerId: data.organizer.id, patch, startList: data }
}

export const patchEvent = async (
  eventId: string,
  existing: JsonDogEvent,
  next: JsonDogEvent
): Promise<{ event: JsonDogEvent; change?: EventChange }> => {
  const { changes, remove, set } = createPatch(next, existing)
  const becomesPublic = existing.state === 'draft' && next.state !== 'draft'
  const staysDraft = existing.state === 'draft' && next.state === 'draft'

  if (!set && !remove) {
    return { event: existing }
  }

  await dynamoDB.update(
    { id: eventId },
    {
      ...(set ? { set } : {}),
      ...(remove ? { remove } : {}),
    },
    eventTable
  )

  const change: EventChange = staysDraft
    ? { audience: 'admin', organizerId: next.organizer.id, patch: { eventId, ...changes } }
    : {
        audience: 'public',
        organizerId: next.organizer.id,
        patch: { eventId, ...(becomesPublic ? next : changes) },
        ...(becomesPublic || affectsPublicStartList(changes) ? { startList: next } : {}),
      }

  return { change, event: await getEvent<JsonDogEvent>(eventId) }
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

  // The counts reach open clients through publishEventCounts, which the caller sends.
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
    // Structured so the client can tell "busy, retry" apart from other 409s (KOE-1265).
    JSON.stringify({ error: 'groupsBusy', message: 'Registration groups are being updated. Please retry.' })
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

export const saveGroup = async (
  { eventId, id, group }: JsonRegistrationGroupInfo,
  previous: JsonRegistrationGroupInfo['group'],
  user: AuditActor,
  reason?: GroupChangeReason,
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
  const groupAudit = groupChangeAudit(previous, group, reason)
  if (groupAudit) await audit({ auditKey: registrationAuditKey(registrationKey), ...groupAudit, ...auditUser(user) })
}

export const fixRegistrationGroups = async <T extends JsonRegistration>(
  items: T[],
  user: AuditActor,
  save: boolean = true
): Promise<T[]> => {
  const previousGroups = new Map(items.map((item) => [item, item.group ? { ...item.group } : undefined]))
  normalizeRegistrationGroups(items)

  if (!save) return items

  // Each registration's row and audit line is its own; the saves need not wait for one another.
  const moved = items.filter((registration) => {
    const previous = previousGroups.get(registration)
    return registration.group?.key !== previous?.key || registration.group?.number !== previous?.number
  })
  await mapWithConcurrency(moved, REGISTRATION_WRITE_CONCURRENCY, (registration) =>
    saveGroup(registration, previousGroups.get(registration), user, 'automatic')
  )

  return items
}

/** Repairs and persists the ready-registration ordering under the event lock. */
export const repairReadyRegistrationGroups = async (
  eventId: string,
  user: AuditActor
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

/**
 * The trial as a tokenized link may see it (KOE-1258, KOE-1267): what a link's screen heads its sheet
 * with, and nothing else off the event record. One reading for every link family, so a field added to
 * one link's head cannot quietly stay off another's.
 */
export const linkedEventProjection = (confirmedEvent: JsonConfirmedEvent): JsonLinkedEvent => ({
  classes: confirmedEvent.classes,
  endDate: confirmedEvent.endDate,
  eventType: confirmedEvent.eventType,
  id: confirmedEvent.id,
  location: confirmedEvent.location,
  name: confirmedEvent.name,
  names: confirmedEvent.names,
  startDate: confirmedEvent.startDate,
})

interface ResultsDayPublish {
  /** The class whose day changes; absent for a classless event. */
  eventClass?: RegistrationClass
  /** The day, yyyy-MM-dd. Only this day changes (KOE-1510). */
  date: string
  published: boolean
}

/** A publish of results refused by the publishing rules, as the panel would have greyed it (KOE-1466). */
const publishBlocked = (confirmedEvent: JsonConfirmedEvent, { date, eventClass, published }: ResultsDayPublish) => {
  if (!published) return undefined
  const reason = getResultsBlocker(confirmedEvent, eventClass, date)
  return reason && httpError(422, { error: 'publishBlocked', eventClass, publish: 'results', reason })
}

/** The write of one day's change: the class's own entry of a stored map, or else the whole flag. */
const resultsWrite = (confirmedEvent: JsonConfirmedEvent, eventClass: ClassOrNone, next: ResultsPublishedState) => {
  const stored = confirmedEvent.resultsPublished
  if (eventClass && isResultsPublishedClassMap(stored) && isResultsPublishedClassMap(next)) {
    return {
      condition: foldedFrom(
        '#resultsPublished.#resultsClass',
        { '#resultsClass': eventClass, '#resultsPublished': 'resultsPublished' },
        stored[eventClass]
      ),
      set: { [`resultsPublished.${eventClass}`]: next[eventClass] },
    }
  }
  return {
    condition: foldedFrom('#resultsPublished', { '#resultsPublished': 'resultsPublished' }, stored),
    set: { resultsPublished: next },
  }
}

/**
 * One attempt: judge the publish by the publishing rules, fold the day into the flag as read, and
 * write it on condition that the flag is still as read (see foldedFrom). Answers with the event as
 * written, its flag read off the row.
 */
const writeResultsDay = async (
  confirmedEvent: JsonConfirmedEvent,
  request: ResultsDayPublish,
  updatedAt: string
): Promise<JsonConfirmedEvent> => {
  const blocked = publishBlocked(confirmedEvent, request)
  if (blocked) throw blocked

  const { date, eventClass, published } = request
  const { condition, set } = resultsWrite(
    confirmedEvent,
    eventClass,
    withResultsDay(confirmedEvent, eventClass, date, published)
  )
  const output = await dynamoDB.update(
    { id: confirmedEvent.id },
    { set: { ...set, updatedAt } },
    eventTable,
    'ALL_NEW',
    condition
  )

  const resultsPublished: unknown = output.Attributes?.resultsPublished
  if (!isResultsPublishedState(resultsPublished)) throw new Error('the written row holds no results flag')
  return { ...confirmedEvent, resultsPublished, updatedAt }
}

const RESULTS_WRITE_ATTEMPTS = 3

/**
 * Publish or hide one day's results on the event record (KOE-1510). The request is a change of one
 * day, and the scope is folded here from the stored day keys, never from a client's copy, whose JSON
 * reviver has turned them into dates.
 *
 * Several secretaries publish at once, and one can hide two days in quick succession. Where the stored
 * flag already is a class map, only the class's own entry is written, so another class's publish made
 * meanwhile stays; where it is not (a plain flag about to become a map, or a classless event's one
 * scope), the whole flag is. Either write lands only on the flag it was folded from. When another
 * write got there first, the row is read again as last written, the rules are judged and the day
 * folded afresh, and the write is tried again; only after RESULTS_WRITE_ATTEMPTS is it a conflict.
 *
 * `updatedAt` moves with the flag so an incremental fetch carries it, as with the start numbers
 * (KOE-1352). `modifiedAt` stays: publishing is not an edit to the event.
 */
export const setResultsPublishedState = (
  confirmedEvent: JsonConfirmedEvent,
  request: ResultsDayPublish,
  now: Date = new Date()
): Promise<JsonConfirmedEvent> => {
  const updatedAt = now.toISOString()
  return retryOnConditionFailure(
    async (attempt) => {
      const current = attempt === 1 ? confirmedEvent : await getEvent<JsonConfirmedEvent>(confirmedEvent.id, true)
      return writeResultsDay(current, request, updatedAt)
    },
    RESULTS_WRITE_ATTEMPTS,
    () => httpError(409, { error: 'resultsPublishedChanged' })
  )
}
