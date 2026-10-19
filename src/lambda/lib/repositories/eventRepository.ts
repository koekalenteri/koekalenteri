import type { ClassOrNone, JsonDogEvent, JsonKcState, JsonStationTurn, ResultsPublishedState } from '../../../types'
import type { UpdateActions } from '../../utils/CustomDynamoClient'
import { isResultsPublishedClassMap } from '../../../lib/event'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { foldedFrom } from '../conditionalWrite'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

/** The registration workflows one event serializes, each with a lock of its own on the event row. */
export type EventWorkflowLock = 'registrationGroupsLock' | 'registrationPaymentsLock'

// `judges` is optional: the projection can return items without the attribute, and the judge
// workload seeding already treats a missing list as empty.
export type EventStatsEvent = Pick<
  JsonDogEvent,
  'classes' | 'endDate' | 'eventType' | 'id' | 'places' | 'startDate' | 'state'
> &
  Partial<Pick<JsonDogEvent, 'judges'>> & {
    organizer: { id: string }
  }

type EventEntryEndDates = Pick<JsonDogEvent, 'id' | 'entryEndDate' | 'entryOrigEndDate'>

const EVENT_STATS_PROJECTION_NAMES = { '#state': 'state' }
const EVENT_STATS_PROJECTION = 'id, organizer, startDate, endDate, eventType, classes, places, #state, judges'

/** `consistent` reads the row as last written, for a caller about to write back what it folds from it. */
export const readEvent = async <T extends JsonDogEvent = JsonDogEvent>(eventId: string, consistent = false) =>
  dynamoDB.read<T>({ id: eventId }, consistent)

/** Every event in the table, for the jobs that walk them all (the data migrations, the user merge). */
export const readAllEvents = async (): Promise<JsonDogEvent[]> => (await dynamoDB.readAll<JsonDogEvent>()) ?? []

/** Every event, with only the fields the stats rebuild counts from. */
export const readEventsForStats = async () =>
  dynamoDB.readAll<EventStatsEvent>({
    names: EVENT_STATS_PROJECTION_NAMES,
    projection: EVENT_STATS_PROJECTION,
  })

/** The ids of the events linked to the Kennel Club trial number. */
export const findEventIdsByKcId = async (kcId: number) =>
  dynamoDB.readAll<Pick<JsonDogEvent, 'id'>>({
    filter: 'kcId = :kcId',
    projection: 'id',
    values: { ':kcId': kcId },
  })

/** The ids of the events linked to the Kennel Club trial GUID. */
export const findEventIdsByKcGuid = async (kcGuid: string) =>
  dynamoDB.readAll<Pick<JsonDogEvent, 'id'>>({
    filter: 'kcGuid = :kcGuid',
    projection: 'id',
    values: { ':kcGuid': kcGuid },
  })

/** The entry end of the latest event of the type whose entry closed before `entryEndDate`. */
export const readLastEntryEndBefore = async (
  eventType: string,
  entryEndDate: string
): Promise<EventEntryEndDates | undefined> => {
  const result = await dynamoDB.query<EventEntryEndDates>({
    forward: false,
    index: 'gsiEventTypeEntryEndDateV2',
    key: 'eventType = :eventType AND entryEndDate < :entryEndDate',
    limit: 1,
    values: { ':entryEndDate': entryEndDate, ':eventType': eventType },
  })
  return result?.[0]
}

/** The season's published events (drafts left out by the query) that start by `startsBy`. */
export const readPublicSeasonEvents = async (season: string, startsBy: string) =>
  dynamoDB.query<JsonDogEvent>({
    filterExpression: '#state <> :draft',
    index: 'gsiSeasonStartDate',
    key: 'season = :season AND startDate <= :endDate',
    names: { '#state': 'state' },
    values: {
      ':draft': 'draft',
      ':endDate': startsBy,
      ':season': season,
    },
  })

/** Every event of the season, drafts included. */
export const readSeasonEvents = async (season: number) =>
  dynamoDB.query<JsonDogEvent>({
    index: 'gsiSeasonStartDate',
    key: 'season = :season',
    values: { ':season': season.toString() },
  })

/** The season's events stored at or after `updatedAfter`. */
export const readSeasonEventsUpdatedSince = async (season: number, updatedAfter: string) =>
  dynamoDB.query<JsonDogEvent>({
    index: 'gsiSeasonUpdatedAt',
    key: 'season = :season AND updatedAt >= :updatedAfter',
    values: { ':season': season.toString(), ':updatedAfter': updatedAfter },
  })

/** Every event of one organizer. */
export const readOrganizerEvents = async (organizerId: string) =>
  dynamoDB.query<JsonDogEvent>({
    index: 'gsiOrganizerStartDate',
    key: 'organizerId = :organizerId',
    values: { ':organizerId': organizerId },
  })

/** Stores the whole event, replacing the row. */
export const writeEvent = async (event: JsonDogEvent) => {
  await dynamoDB.write(event)
}

/** Sets and removes fields of the event, with no condition. */
export const writeEventFields = async (eventId: string, changes: UpdateActions) => {
  await dynamoDB.update({ id: eventId }, changes)
}

/**
 * Takes the workflow lock on an existing event when nobody holds it or the holder's has expired by
 * `now`. Throws DynamoDB's condition failure when another holder's lock is still on.
 */
export const writeWorkflowLock = async (
  eventId: string,
  field: EventWorkflowLock,
  token: string,
  now: number,
  expiresAt: number
) => {
  const lockName = `#${field}`
  await dynamoDB.update({ id: eventId }, { set: { [field]: { expiresAt, token } } }, undefined, {
    expression: `attribute_exists(#id) AND (attribute_not_exists(${lockName}) OR ${lockName}.#expiresAt < :now)`,
    names: { '#expiresAt': 'expiresAt', '#id': 'id', [lockName]: field },
    values: { ':now': now },
  })
}

/** Removes the workflow lock while it is still the one `token` took. Throws the condition failure otherwise. */
export const clearWorkflowLock = async (eventId: string, field: EventWorkflowLock, token: string) => {
  const lockName = `#${field}`
  await dynamoDB.update({ id: eventId }, { remove: [field] }, undefined, {
    expression: `${lockName}.#token = :token`,
    names: { [lockName]: field, '#token': 'token' },
    values: { ':token': token },
  })
}

/** The write of one day's change: the class's own entry of a stored map, or else the whole flag. */
const resultsWrite = (
  stored: ResultsPublishedState | undefined,
  eventClass: ClassOrNone,
  next: ResultsPublishedState
) => {
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
 * Writes the results flag folded from `stored`, on condition that the flag is still `stored` (see
 * foldedFrom). Where both are class maps only the class's own entry is written. Answers with the
 * flag as the row holds it after the write.
 */
export const writeResultsPublished = async (
  eventId: string,
  eventClass: ClassOrNone,
  stored: ResultsPublishedState | undefined,
  next: ResultsPublishedState,
  updatedAt: string
): Promise<unknown> => {
  const { condition, set } = resultsWrite(stored, eventClass, next)
  const output = await dynamoDB.update({ id: eventId }, { set: { ...set, updatedAt } }, 'ALL_NEW', condition)
  return output.Attributes?.resultsPublished
}

/**
 * Writes a reading of the Kennel Club state when it is no older than the stored one, and a stored
 * handed-over state is replaced by a reading of another state only once it is older than `freshAfter`.
 * Throws the condition failure otherwise.
 */
export const writeKcStateReading = async (
  eventId: string,
  kcState: JsonKcState,
  freshAfter: string,
  handedOver: number,
  updatedAt: string
) => {
  await dynamoDB.update({ id: eventId }, { set: { kcState, updatedAt } }, 'NONE', {
    expression:
      'attribute_exists(#id) AND (attribute_not_exists(#kcState) OR (#kcState.#readAt <= :readAt AND (:code = :handedOver OR #kcState.#code <> :handedOver OR #kcState.#readAt <= :freshAfter)))',
    names: { '#code': 'code', '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
    values: {
      ':code': kcState.code,
      ':freshAfter': freshAfter,
      ':handedOver': handedOver,
      ':readAt': kcState.readAt,
    },
  })
}

/**
 * Writes the handed-over state where none is stored and no newer reading is. Throws the condition
 * failure otherwise.
 */
export const writeKcStateLock = async (eventId: string, locked: JsonKcState, handedOver: number) => {
  await dynamoDB.update({ id: eventId }, { set: { kcState: locked, updatedAt: locked.readAt } }, 'NONE', {
    expression:
      'attribute_exists(#id) AND (attribute_not_exists(#kcState) OR (#kcState.#code <> :handedOver AND #kcState.#readAt <= :readAt))',
    names: { '#code': 'code', '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
    values: { ':handedOver': handedOver, ':readAt': locked.readAt },
  })
}

/** Puts `restored` back while the stored state is still the lock read at `lockedAt`. Throws the condition failure otherwise. */
export const restoreKcState = async (eventId: string, restored: JsonKcState, lockedAt: string, updatedAt: string) => {
  await dynamoDB.update({ id: eventId }, { set: { kcState: restored, updatedAt } }, 'NONE', {
    expression: 'attribute_exists(#id) AND #kcState.#readAt = :lockedAt',
    names: { '#id': 'id', '#kcState': 'kcState', '#readAt': 'readAt' },
    values: { ':lockedAt': lockedAt },
  })
}

/** Links the event to the Kennel Club trial where it has no link yet. Throws the condition failure otherwise. */
export const writeKcGuidLink = async (eventId: string, kcGuid: string, updatedAt: string) => {
  await dynamoDB.update({ id: eventId }, { set: { kcGuid, updatedAt } }, 'NONE', {
    expression: 'attribute_exists(#id) AND attribute_not_exists(#kcGuid)',
    names: { '#id': 'id', '#kcGuid': 'kcGuid' },
  })
}

/**
 * Stores the station timeline on condition that the stored one is still `expected` (none stored when
 * `expected` is undefined). Throws the condition failure otherwise.
 */
export const writeStationTurns = async (
  eventId: string,
  expected: JsonStationTurn[] | undefined,
  turns: JsonStationTurn[],
  updatedAt: string
) => {
  const condition = expected
    ? { expression: '#turns = :expected', names: { '#turns': 'turns' }, values: { ':expected': expected } }
    : { expression: 'attribute_not_exists(#turns)', names: { '#turns': 'turns' } }

  await dynamoDB.update({ id: eventId }, { set: { turns, updatedAt } }, undefined, condition)
}

/**
 * Writes a migration's changes on condition that the row still exists and nobody moved it since it
 * was read with `readUpdatedAt`. Without the existence check an update of a deleted row would create
 * a stub holding only the migrated fields. Throws the condition failure otherwise.
 */
export const writeMigratedEvent = async (
  eventId: string,
  changes: UpdateActions,
  readUpdatedAt: string | undefined
) => {
  await dynamoDB.update(
    { id: eventId },
    changes,
    undefined,
    foldedFrom('#updatedAt', { '#updatedAt': 'updatedAt' }, readUpdatedAt)
  )
}
