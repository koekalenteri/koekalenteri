import type {
  ClassOrNone,
  DayKey,
  JsonDogEvent,
  JsonKcState,
  JsonStationTurn,
  ResultsPublishedState,
} from '../../../types'
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
/** A row of the entry end index, which holds only the events that have an entry end: its sort key. */
type IndexedEntryEnd = EventEntryEndDates & Required<Pick<JsonDogEvent, 'entryEndDate'>>

const EVENT_STATS_PROJECTION_NAMES = { '#state': 'state' }
const EVENT_STATS_PROJECTION = 'id, organizer, startDate, endDate, eventType, classes, places, #state, judges'

/** `consistent` reads the row as last written, for a caller about to write back what it folds from it. */
export const readEvent = async <T extends JsonDogEvent = JsonDogEvent>(eventId: string, consistent = false) =>
  dynamoDB.read<T>({ id: eventId }, consistent)

/**
 * The event as the public readers may see it: a soft-deleted row reads as no event, as one that was
 * never stored does (KOE-1586). The admin readers keep `readEvent`, which reads the deleted rows too.
 */
export const readLiveEvent = async <T extends JsonDogEvent = JsonDogEvent>(eventId: string, consistent = false) => {
  const row = await readEvent<T>(eventId, consistent)
  return row?.deletedAt ? undefined : row
}

/**
 * Every event in the table, for the jobs that walk them all (the data migrations, the user merge).
 * The deleted ones only on request: a migration changes the shape of every stored row.
 */
export const readAllEvents = async (includeDeleted = false): Promise<JsonDogEvent[]> =>
  (await dynamoDB.readAll<JsonDogEvent>({ includeDeleted })) ?? []

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

const isLiveEvent = async (eventId: string) => Boolean(await readLiveEvent(eventId))

/** The first of the candidates, in their order, whose row is neither soft-deleted nor gone. */
const firstLive = async (candidates: IndexedEntryEnd[]): Promise<IndexedEntryEnd | undefined> => {
  const [candidate, ...rest] = candidates
  if (!candidate) return undefined
  return (await isLiveEvent(candidate.id)) ? candidate : firstLive(rest)
}

/**
 * The type's latest entry end before `before`, deleted rows included, as is every row of one entry end
 * below: the index projects no deletedAt, and the database refuses a filter on an attribute an index
 * does not project.
 */
const queryLatestEntryEndBefore = async (eventType: string, before: string) =>
  (
    await dynamoDB.query<IndexedEntryEnd>({
      forward: false,
      // The index projects no deletedAt: decided by the row.
      includeDeleted: true,
      index: 'gsiEventTypeEntryEndDateV2',
      key: 'eventType = :eventType AND entryEndDate < :entryEndDate',
      limit: 1,
      values: { ':entryEndDate': before, ':eventType': eventType },
    })
  )?.[0]

const queryEntryEndsOn = async (eventType: string, entryEndDate: string) =>
  (await dynamoDB.query<IndexedEntryEnd>({
    // The index projects no deletedAt: decided by the row.
    includeDeleted: true,
    index: 'gsiEventTypeEntryEndDateV2',
    key: 'eventType = :eventType AND entryEndDate = :entryEndDate',
    values: { ':entryEndDate': entryEndDate, ':eventType': eventType },
  })) ?? []

/**
 * The latest live entry end before `before`. The latest row comes first, and on a live one that is
 * one index row and one read. A deleted or vanished one is passed over to the other rows stored with
 * the same entry end, which the next bound (`<` that day) would skip, and then to the days before.
 */
const latestLiveEntryEndBefore = async (eventType: string, before: string): Promise<EventEntryEndDates | undefined> => {
  const latest = await queryLatestEntryEndBefore(eventType, before)
  if (!latest) return undefined
  if (await isLiveEvent(latest.id)) return latest

  const sameDay = (await queryEntryEndsOn(eventType, latest.entryEndDate)).filter(({ id }) => id !== latest.id)
  return (await firstLive(sameDay)) ?? latestLiveEntryEndBefore(eventType, latest.entryEndDate)
}

/**
 * The entry end of the latest event of the type whose entry closed on a day before `entryEndDate`.
 * The index sorts the stored days as text, which orders day keys by day (KOE-1547). A deleted event is
 * no previous trial, so a deleted row is passed over to the latest live one (KOE-1585).
 */
export const readLastEntryEndBefore = async (
  eventType: string,
  entryEndDate: DayKey
): Promise<EventEntryEndDates | undefined> => latestLiveEntryEndBefore(eventType, entryEndDate)

/**
 * The season's published events (drafts and deleted events left out by the query) that start on
 * `startsBy` or before. The index sorts the stored start days as text, which orders day keys by day (KOE-1547).
 */
export const readPublicSeasonEvents = async (season: string, startsBy: DayKey) =>
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

/** Every event of the season, drafts and deleted events included. */
export const readSeasonEvents = async (season: number) =>
  dynamoDB.query<JsonDogEvent>({
    // The admin list keeps the deleted rows it caches and hides them itself.
    includeDeleted: true,
    index: 'gsiSeasonStartDate',
    key: 'season = :season',
    values: { ':season': season.toString() },
  })

/** The season's events stored at or after `updatedAfter`, deleted events included. */
export const readSeasonEventsUpdatedSince = async (season: number, updatedAfter: string) =>
  dynamoDB.query<JsonDogEvent>({
    // A deleted row is how the admin list's since fetch learns of the deletion.
    includeDeleted: true,
    index: 'gsiSeasonUpdatedAt',
    key: 'season = :season AND updatedAt >= :updatedAfter',
    values: { ':season': season.toString(), ':updatedAfter': updatedAfter },
  })

/** Every event of one organizer, deleted events included. */
export const readOrganizerEvents = async (organizerId: string) =>
  dynamoDB.query<JsonDogEvent>({
    // The admin list keeps the deleted rows it caches and hides them itself.
    includeDeleted: true,
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
