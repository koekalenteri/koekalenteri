// Rebuilds statistics from scratch out of the events and registrations tables.
//
// Two callers with different scopes share this: the manual RebuildAllStatsFunction rebuilds
// everything, and the scheduled RebuildStatsFunction rebuilds every partition except ORG#.
// ORG# is excluded from the scheduled run on purpose: it is the one partition still maintained
// incrementally on registration writes, and a delete-then-write pass over it would race those
// writes. Every other partition has exactly one writer — this module — so rebuilding is safe.
import type { EventState, JsonDogEvent, JsonRegistration } from '../../types'
import type {
  JsonBreedStartStatsItem,
  JsonCapacityStatsItem,
  JsonEventBreakdownItem,
  JsonEventStatsItem,
  JsonJudgeWorkloadItem,
  YearlyStatTypes,
} from '../../types/Stats'
import type { RegistrationStatsInput } from './stats'
import { OFFICIAL_EVENT_TYPES, uniqueClasses } from '../../lib/event'
import { getRegistrationClass, isMember, isParticipantGroup } from '../../lib/registration'
import { splitEvenly } from '../../lib/utils'
import { ALL_EVENT_TYPES_FOR_CAPACITY, ALL_ORGANIZERS_FOR_EVENTS } from '../../types/Stats'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import {
  bucketForCount,
  eventStatsMonth,
  eventStatsYear,
  hashStatValue,
  organizerStatsKey,
  participationIdentifiers,
} from './stats'

interface EventStatKey {
  PK: string
  SK: string
}

// `judges` is optional: the projection can return items without the attribute, and the judge
// workload seeding already treats a missing list as empty.
export type EventStatsEvent = Pick<JsonDogEvent, 'classes' | 'eventType' | 'id' | 'places' | 'startDate' | 'state'> &
  Partial<Pick<JsonDogEvent, 'judges'>> & {
    organizer: { id: string }
  }

type CapacityRegistrationInput = RegistrationStatsInput & Pick<JsonRegistration, 'group'>

const REGISTRATION_STATS_PROJECTION_NAMES = {
  '#class': 'class',
  '#group': 'group',
  '#handler': 'handler',
  '#key': 'key',
  '#owner': 'owner',
}
const REGISTRATION_STATS_PROJECTION =
  'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #handler.membership, #owner.membership, owners, ownerHandles, #class, #group.#key'
const EVENT_STATS_PROJECTION_NAMES = { '#state': 'state' }
const EVENT_STATS_PROJECTION = 'id, organizer, startDate, eventType, classes, places, #state, judges'
const PARTICIPATION_TYPES: YearlyStatTypes[] = ['eventType', 'dog', 'breed', 'handler', 'dog#handler', 'class', 'event']
// Draft/tentative/cancelled events aren't real committed capacity, so they're excluded from
// capacity stats (unlike the organizer/participation stats above, which count every event
// regardless of state). Events predating the state field are treated as committed.
const CAPACITY_EXCLUDED_STATES = new Set<EventState>(['cancelled', 'draft', 'tentative'])
const countsTowardsCapacity = (event: EventStatsEvent): boolean =>
  !event.state || !CAPACITY_EXCLUDED_STATES.has(event.state)

const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)

/**
 * Which group of stats records a key belongs to. `organizer` is the only partition also written
 * incrementally on registration writes; the rest are owned solely by this module.
 */
type StatsPartition = 'organizer' | 'participation' | 'capacity' | 'judges' | 'eventBreakdown'

export const ALL_STATS_PARTITIONS: StatsPartition[] = [
  'organizer',
  'participation',
  'capacity',
  'judges',
  'eventBreakdown',
]
/** Everything the scheduled rebuild owns: safe to delete and rewrite while the site is live. */
export const REBUILDABLE_STATS_PARTITIONS: StatsPartition[] = ['participation', 'capacity', 'judges', 'eventBreakdown']

export const getStatsRecordPartition = ({ PK }: EventStatKey): StatsPartition | undefined => {
  if (PK.startsWith('ORG#')) return 'organizer'
  if (PK.startsWith('CAPACITY#')) return 'capacity'
  if (PK.startsWith('JUDGE#')) return 'judges'
  if (PK.startsWith('BREAKDOWN#')) return 'eventBreakdown'
  if (PK === 'YEARS' || /^(?:STAT|TOTALS|BUCKETS|RETENTION)#/.test(PK)) return 'participation'
  return undefined
}

/** Returns the year represented by a stats-table key, if it is a stats record. */
export function getEventStatsRecordYear({ PK, SK }: EventStatKey): number | undefined {
  const match =
    /^(?:STAT|TOTALS|BUCKETS|RETENTION|JUDGE|BREAKDOWN)#(\d{4})(?:#|$)/.exec(PK) ||
    (PK === 'YEARS' ? /^(\d{4})$/.exec(SK) : undefined)
  if (match) return Number(match[1])

  if (PK.startsWith('ORG#')) {
    const eventIdSeparator = SK.indexOf('#')
    return eventIdSeparator === -1 ? undefined : eventStatsYear({ startDate: SK.slice(0, eventIdSeparator) })
  }

  if (PK.startsWith('CAPACITY#')) {
    const monthMatch = /^(\d{4})-\d{2}#/.exec(SK)
    return monthMatch ? Number(monthMatch[1]) : undefined
  }

  return undefined
}

const increment = (counts: Map<string, number>, key: string, amount = 1) => {
  counts.set(key, (counts.get(key) ?? 0) + amount)
}

const countsForType = (countsByType: Map<YearlyStatTypes, Map<string, number>>, type: YearlyStatTypes) => {
  const counts = countsByType.get(type)
  if (!counts) throw new Error(`Missing counts for statistic type ${type}`)
  return counts
}

const updateOrganizerStats = (
  organizerStats: Map<string, JsonEventStatsItem>,
  event: EventStatsEvent,
  registration: RegistrationStatsInput,
  updatedAt: string
) => {
  const key = organizerStatsKey(event)
  const mapKey = `${key.PK}/${key.SK}`
  const stats = organizerStats.get(mapKey) ?? {
    ...key,
    cancelledRegistrations: 0,
    count: 0,
    date: event.startDate,
    memberRegistrations: 0,
    organizerId: event.organizer.id,
    paidAmount: 0,
    paidRegistrations: 0,
    refundedAmount: 0,
    refundedRegistrations: 0,
    reserveRegistrations: 0,
    updatedAt,
  }
  const isStarter = !registration.cancelled && isParticipantGroup(registration.group?.key)
  stats.count = (stats.count ?? 0) + 1
  stats.cancelledRegistrations = (stats.cancelledRegistrations ?? 0) + (registration.cancelled ? 1 : 0)
  stats.reserveRegistrations = (stats.reserveRegistrations ?? 0) + (!registration.cancelled && !isStarter ? 1 : 0)
  stats.memberRegistrations = (stats.memberRegistrations ?? 0) + (isStarter && isMember(registration) ? 1 : 0)
  stats.paidAmount = (stats.paidAmount ?? 0) + (registration.paidAmount ?? 0)
  stats.paidRegistrations = (stats.paidRegistrations ?? 0) + (registration.paidAmount ? 1 : 0)
  stats.refundedAmount = (stats.refundedAmount ?? 0) + (registration.refundAmount ?? 0)
  stats.refundedRegistrations = (stats.refundedRegistrations ?? 0) + (registration.refundAmount ? 1 : 0)
  organizerStats.set(mapKey, stats)
}

const getYearlyCounts = (yearlyStats: Map<number, Map<YearlyStatTypes, Map<string, number>>>, year: number) => {
  const existing = yearlyStats.get(year)
  if (existing) return existing

  const counts = new Map(PARTICIPATION_TYPES.map((type) => [type, new Map<string, number>()]))
  yearlyStats.set(year, counts)
  return counts
}

/**
 * Seeds the per-year 'event' counts with every committed official event, so the TOTALS 'event'
 * figure means "events held" rather than "events that got at least one registration". Without
 * this, a year where half the events drew no entries shows the same registrations-per-event
 * average as a year where every event filled. Draft/tentative/cancelled events are excluded the
 * same way as for capacity: they were never committed capacity to fill.
 */
const seedEventCountsFromEvents = (
  eventsById: Map<string, EventStatsEvent>,
  yearlyStats: Map<number, Map<YearlyStatTypes, Map<string, number>>>
): void => {
  for (const event of eventsById.values()) {
    if (!OFFICIAL_EVENT_TYPES.includes(event.eventType) || !countsTowardsCapacity(event)) continue
    const year = eventStatsYear(event)
    if (year === undefined) continue

    const counts = countsForType(getYearlyCounts(yearlyStats, year), 'event')
    if (!counts.has(event.id)) counts.set(event.id, 0)
  }
}

const dogHandlerBucketRecords = (year: number, counts: Map<string, number>): JsonEventStatsItem[] => {
  const buckets = new Map<string, number>()
  for (const count of counts.values()) {
    const bucket = bucketForCount(count)
    if (bucket) increment(buckets, bucket)
  }
  return [...buckets].map(([bucket, count]) => ({ count, PK: `BUCKETS#${year}#dog#handler`, SK: bucket }))
}

/** How many distinct dogs each handler ran that year, bucketed -- e.g. "38 handlers ran exactly 2 dogs". */
const dogsPerHandlerBucketRecords = (year: number, handlerDogs: Map<string, Set<string>>): JsonEventStatsItem[] => {
  const buckets = new Map<string, number>()
  for (const dogs of handlerDogs.values()) {
    const bucket = bucketForCount(dogs.size)
    if (bucket) increment(buckets, bucket)
  }
  return [...buckets].map(([bucket, count]) => ({ count, PK: `BUCKETS#${year}#dogsPerHandler`, SK: bucket }))
}

/**
 * How many dog+handler pairs of a year had also competed the year before.
 *
 * Only produced when the previous year is part of this rebuild: without it, every pair would
 * look new, which says nothing about retention and everything about where the data starts. The
 * earliest year therefore gets no record rather than a misleading one.
 */
const retentionRecords = (
  year: number,
  countsByType: Map<YearlyStatTypes, Map<string, number>>,
  yearlyStats: Map<number, Map<YearlyStatTypes, Map<string, number>>>
): JsonEventStatsItem[] => {
  const previous = yearlyStats.get(year - 1)
  if (!previous) return []

  const previousPairs = countsForType(previous, 'dog#handler')
  // A previous year that exists only because events were seeded into its 'event' counts has no
  // registration data to compare against; retention against it would be the same misleading
  // "everyone is new" the earliest-year rule guards against.
  if (previousPairs.size === 0) return []
  let returning = 0
  let fresh = 0
  for (const pair of countsForType(countsByType, 'dog#handler').keys()) {
    if (previousPairs.has(pair)) returning++
    else fresh++
  }
  return [
    { count: fresh, PK: `RETENTION#${year}`, SK: 'new' },
    { count: returning, PK: `RETENTION#${year}`, SK: 'returning' },
  ]
}

const yearlyStatsRecords = (
  yearlyStats: Map<number, Map<YearlyStatTypes, Map<string, number>>>,
  handlerDogsByYear: Map<number, Map<string, Set<string>>>
) => {
  const records: JsonEventStatsItem[] = []
  for (const [year, countsByType] of yearlyStats) {
    for (const type of PARTICIPATION_TYPES) {
      const counts = countsForType(countsByType, type)
      records.push({ count: counts.size, PK: `TOTALS#${year}`, SK: type })
      for (const [entityId, count] of counts) records.push({ count, PK: `STAT#${year}#${type}`, SK: entityId })
      if (type === 'dog#handler') records.push(...dogHandlerBucketRecords(year, counts))
    }
    const handlerDogs = handlerDogsByYear.get(year)
    if (handlerDogs) records.push(...dogsPerHandlerBucketRecords(year, handlerDogs))
    records.push(...retentionRecords(year, countsByType, yearlyStats))
  }
  return records
}

interface StatsAccumulator {
  organizerStats: Map<string, JsonEventStatsItem>
  yearlyStats: Map<number, Map<YearlyStatTypes, Map<string, number>>>
  handlerDogsByYear: Map<number, Map<string, Set<string>>>
  years: Set<number>
}

const getHandlerDogs = (handlerDogsByYear: Map<number, Map<string, Set<string>>>, year: number) => {
  const existing = handlerDogsByYear.get(year)
  if (existing) return existing

  const handlerDogs = new Map<string, Set<string>>()
  handlerDogsByYear.set(year, handlerDogs)
  return handlerDogs
}

interface CapacityBucket {
  cancelledRegistrations: number
  classKey: string
  eventCount: number
  eventType: string
  month: string
  organizerId: string
  places: number
  reserve: number
  starters: number
}

const capacityBucketKey = (eventType: string, month: string, classKey: string, organizerId: string) =>
  `${eventType}#${month}#${classKey}#${organizerId}`

const getOrCreateCapacityBucket = (
  buckets: Map<string, CapacityBucket>,
  eventType: string,
  month: string,
  classKey: string,
  organizerId: string
): CapacityBucket => {
  const key = capacityBucketKey(eventType, month, classKey, organizerId)
  const existing = buckets.get(key)
  if (existing) return existing

  const bucket: CapacityBucket = {
    cancelledRegistrations: 0,
    classKey,
    eventCount: 0,
    eventType,
    month,
    organizerId,
    places: 0,
    reserve: 0,
    starters: 0,
  }
  buckets.set(key, bucket)
  return bucket
}

/** Classless event types get a single bucket keyed by the event type itself. */
const eventClassKeys = (event: EventStatsEvent): string[] => {
  const classes = uniqueClasses(event)
  return classes.length > 0 ? classes : [event.eventType]
}

/**
 * Places per class. Explicit per-class values win; whatever `event.places` leaves unaccounted
 * for is spread over the classes that have none. `event.places` is the event *total* (the form
 * derives it by summing the classes, see calculateTotalFromClasses), so attributing it to every
 * class the way placesForClass() does would multiply an event's capacity by its class count.
 */
const eventClassPlaces = (event: EventStatsEvent, classKeys: string[]): Map<string, number> => {
  const classes = Array.isArray(event.classes) ? event.classes : []
  const places = new Map<string, number>()
  const unset: string[] = []

  for (const classKey of classKeys) {
    const sum = classes
      .filter((eventClass) => eventClass.class === classKey)
      .reduce((total, eventClass) => total + (Number(eventClass.places) || 0), 0)
    places.set(classKey, sum)
    if (sum === 0) unset.push(classKey)
  }

  const assigned = [...places.values()].reduce((total, value) => total + value, 0)
  const remaining = Math.max((Number(event.places) || 0) - assigned, 0)
  if (unset.length === 0 || remaining === 0) return places

  splitEvenly(remaining, unset.length).forEach((share, index) => {
    places.set(unset[index], share)
  })
  return places
}

/** The month a class runs in: its own scheduled date if usable, else the event's start date. */
const classMonth = (event: EventStatsEvent, classKey: string): string | undefined => {
  const classes = Array.isArray(event.classes) ? event.classes : []
  const dates = classes
    .filter(
      (eventClass): eventClass is typeof eventClass & { date: string } =>
        eventClass.class === classKey && !!eventClass.date
    )
    .map((eventClass) => eventClass.date)
    .sort((a, b) => a.localeCompare(b))
  return eventStatsMonth(dates[0] ?? event.startDate) ?? eventStatsMonth(event.startDate)
}

/** Seeds capacity (places) per event type/month/class from the events themselves, independent of registrations. */
const seedCapacityFromEvents = (
  eventsById: Map<string, EventStatsEvent>,
  buckets: Map<string, CapacityBucket>,
  eventClassMonths: Map<string, Map<string, string>>
): void => {
  for (const event of eventsById.values()) {
    if (!countsTowardsCapacity(event) || eventStatsYear(event) === undefined) continue

    const classKeys = eventClassKeys(event)
    const placesByClass = eventClassPlaces(event, classKeys)
    const classMonths = new Map<string, string>()
    for (const classKey of classKeys) {
      const month = classMonth(event, classKey)
      if (month === undefined) continue
      classMonths.set(classKey, month)

      const bucket = getOrCreateCapacityBucket(buckets, event.eventType, month, classKey, event.organizer.id)
      bucket.places += placesByClass.get(classKey) ?? 0
      bucket.eventCount += 1
    }
    eventClassMonths.set(event.id, classMonths)
  }
}

/**
 * Attributes one registration's starter/reserve/cancelled status to its event type/month/class
 * bucket. Returns false when the registration cannot be placed in a class the event actually
 * seeded — counting it anyway would create a bucket with starters but no places, which then
 * shows up as a phantom entry in the class selector.
 */
const addCapacityRegistration = (
  registration: CapacityRegistrationInput,
  event: EventStatsEvent,
  buckets: Map<string, CapacityBucket>,
  eventClassMonths: Map<string, Map<string, string>>
): boolean => {
  if (!countsTowardsCapacity(event)) return true

  const classMonths = eventClassMonths.get(event.id)
  if (!classMonths?.size) return false

  const registrationClass = getRegistrationClass(registration) ?? event.eventType
  // A class the event does not offer (removed after entry, or a classless entry on a classed
  // event) is only resolvable when the event has a single class to attribute it to.
  let classKey: string | undefined
  if (classMonths.has(registrationClass)) {
    classKey = registrationClass
  } else if (classMonths.size === 1) {
    classKey = [...classMonths.keys()][0]
  }
  const month = classKey && classMonths.get(classKey)
  if (!classKey || !month) return false

  const bucket = getOrCreateCapacityBucket(buckets, event.eventType, month, classKey, event.organizer.id)

  if (registration.cancelled) {
    bucket.cancelledRegistrations += 1
  } else if (isParticipantGroup(registration.group?.key)) {
    bucket.starters += 1
  } else {
    bucket.reserve += 1
  }
  return true
}

const capacityStatsRecords = (buckets: Map<string, CapacityBucket>, updatedAt: string): JsonCapacityStatsItem[] =>
  [...buckets.values()].map((bucket) => ({
    cancelledRegistrations: bucket.cancelledRegistrations,
    eventCount: bucket.eventCount,
    organizerId: bucket.organizerId,
    PK: `CAPACITY#${bucket.eventType}`,
    places: bucket.places,
    reserve: bucket.reserve,
    SK: `${bucket.month}#${bucket.classKey}#${bucket.organizerId}`,
    starters: bucket.starters,
    updatedAt,
  }))

interface BreedStartBucket {
  breed: string
  reserve: number
  starters: number
  year: number
}

const breedStartBucketKey = (year: number, breed: string) => `${year}#${breed}`

const getOrCreateBreedStartBucket = (
  buckets: Map<string, BreedStartBucket>,
  year: number,
  breed: string
): BreedStartBucket => {
  const key = breedStartBucketKey(year, breed)
  const existing = buckets.get(key)
  if (existing) return existing

  const bucket: BreedStartBucket = { breed, reserve: 0, starters: 0, year }
  buckets.set(key, bucket)
  return bucket
}

/**
 * Starters vs. reserve per breed: what share of a breed's non-cancelled entries actually got a
 * starting position. Cancelled registrations are excluded entirely rather than counted as
 * reserve -- a cancellation never had a real chance at either outcome, so folding it into the
 * denominator would understate how selective a breed's real entries are. Scoped the same way as
 * the breed participation counts this sits next to: official event types only.
 */
const addBreedStartRegistration = (
  registration: CapacityRegistrationInput,
  event: EventStatsEvent,
  year: number,
  buckets: Map<string, BreedStartBucket>
): void => {
  if (registration.cancelled || !countsTowardsCapacity(event) || !OFFICIAL_EVENT_TYPES.includes(event.eventType)) {
    return
  }
  const bucket = getOrCreateBreedStartBucket(buckets, year, registration.dog?.breedCode ?? 'unknown')
  if (isParticipantGroup(registration.group?.key)) {
    bucket.starters += 1
  } else {
    bucket.reserve += 1
  }
}

const breedStartRecords = (buckets: Map<string, BreedStartBucket>, updatedAt: string): JsonBreedStartStatsItem[] =>
  [...buckets.values()].map((bucket) => ({
    PK: `STAT#${bucket.year}#breedStart`,
    reserve: bucket.reserve,
    SK: bucket.breed,
    starters: bucket.starters,
    updatedAt,
  }))

interface EventBreakdownBucket {
  cancelledRegistrations: number
  eventCount: number
  eventType: string
  handlerIds: Set<string>
  memberStarters: number
  organizerId: string
  places: number
  reserve: number
  starters: number
  year: number
}

const eventBreakdownBucketKey = (year: number, organizerId: string, eventType: string) =>
  `${year}#${organizerId}#${eventType}`

const getOrCreateEventBreakdownBucket = (
  buckets: Map<string, EventBreakdownBucket>,
  year: number,
  organizerId: string,
  eventType: string
): EventBreakdownBucket => {
  const key = eventBreakdownBucketKey(year, organizerId, eventType)
  const existing = buckets.get(key)
  if (existing) return existing

  const bucket: EventBreakdownBucket = {
    cancelledRegistrations: 0,
    eventCount: 0,
    eventType,
    handlerIds: new Set(),
    memberStarters: 0,
    organizerId,
    places: 0,
    reserve: 0,
    starters: 0,
    year,
  }
  buckets.set(key, bucket)
  return bucket
}

/**
 * The three (organizer, eventType) combinations one event/registration contributes to: its own
 * club + event type row, that club's cross-type subtotal, and the nationwide grand total. A
 * nationwide-per-event-type-without-club row is deliberately not kept -- the per-club rows are
 * the requested breakdown, and a flat per-club/type export already supports pivoting by type in
 * a spreadsheet if that view is wanted.
 */
const eventBreakdownBucketTargets = (organizerId: string, eventType: string): [string, string][] => [
  [organizerId, eventType],
  [organizerId, ALL_EVENT_TYPES_FOR_CAPACITY],
  [ALL_ORGANIZERS_FOR_EVENTS, ALL_EVENT_TYPES_FOR_CAPACITY],
]

/**
 * Seeds event counts and starting places per year + club + event type from the events
 * themselves, independent of registrations -- an event with no entries yet still counts as
 * organized. Also accumulates into each club's cross-type subtotal and the nationwide grand
 * total, which is the only place either can be computed without double-counting.
 */
const seedEventBreakdownFromEvents = (
  eventsById: Map<string, EventStatsEvent>,
  buckets: Map<string, EventBreakdownBucket>
): void => {
  for (const event of eventsById.values()) {
    if (!countsTowardsCapacity(event)) continue
    const year = eventStatsYear(event)
    if (year === undefined) continue

    const places = Number(event.places) || 0
    for (const [organizerId, eventType] of eventBreakdownBucketTargets(event.organizer.id, event.eventType)) {
      const bucket = getOrCreateEventBreakdownBucket(buckets, year, organizerId, eventType)
      bucket.eventCount += 1
      bucket.places += places
    }
  }
}

/**
 * Attributes one registration's start and handler to its year + club + event type breakdown
 * bucket (and that club's cross-type subtotal, and the grand total). Reserve and cancelled entries are
 * counted separately rather than dropped, and a starter's handler/owner membership feeds
 * `memberStarters` -- only actual starters count toward `handlerIds`, since reserve and cancelled
 * entries never started.
 */
const addEventBreakdownRegistration = (
  registration: CapacityRegistrationInput,
  event: EventStatsEvent,
  year: number,
  buckets: Map<string, EventBreakdownBucket>
): void => {
  if (!countsTowardsCapacity(event)) return

  const handlerId = hashStatValue(registration.handler?.email)
  for (const [organizerId, eventType] of eventBreakdownBucketTargets(event.organizer.id, event.eventType)) {
    const bucket = getOrCreateEventBreakdownBucket(buckets, year, organizerId, eventType)
    if (registration.cancelled) {
      bucket.cancelledRegistrations += 1
    } else if (isParticipantGroup(registration.group?.key)) {
      bucket.starters += 1
      bucket.handlerIds.add(handlerId)
      if (isMember(registration)) bucket.memberStarters += 1
    } else {
      bucket.reserve += 1
    }
  }
}

const eventBreakdownRecords = (
  buckets: Map<string, EventBreakdownBucket>,
  updatedAt: string
): JsonEventBreakdownItem[] =>
  [...buckets.values()].map((bucket) => ({
    cancelledRegistrations: bucket.cancelledRegistrations,
    eventCount: bucket.eventCount,
    eventType: bucket.eventType,
    handlerCount: bucket.handlerIds.size,
    memberStarters: bucket.memberStarters,
    organizerId: bucket.organizerId,
    PK: `BREAKDOWN#${bucket.year}`,
    places: bucket.places,
    reserve: bucket.reserve,
    SK: `${bucket.organizerId}#${bucket.eventType}`,
    starters: bucket.starters,
    updatedAt,
  }))

interface JudgeWorkloadBucket {
  count: number
  judgeId: string
  name: string
  year: number
}

/**
 * How many events each judge officiated per year, counted straight from the events table --
 * unlike participation, this needs no registration at all, just the event's own judge list.
 * A judge assigned to several classes of the same event only counts once for that event.
 */
const seedJudgeWorkloadFromEvents = (
  eventsById: Map<string, EventStatsEvent>,
  buckets: Map<string, JudgeWorkloadBucket>
): void => {
  for (const event of eventsById.values()) {
    if (!countsTowardsCapacity(event)) continue
    const year = eventStatsYear(event)
    if (year === undefined) continue

    const seen = new Set<string>()
    for (const judge of event.judges ?? []) {
      const judgeId = judge.id !== undefined ? String(judge.id) : judge.name
      if (!judgeId || seen.has(judgeId)) continue
      seen.add(judgeId)

      const key = `${year}#${judgeId}`
      const bucket = buckets.get(key) ?? { count: 0, judgeId, name: judge.name, year }
      bucket.count += 1
      buckets.set(key, bucket)
    }
  }
}

const judgeWorkloadRecords = (buckets: Map<string, JudgeWorkloadBucket>, updatedAt: string): JsonJudgeWorkloadItem[] =>
  [...buckets.values()].map((bucket) => ({
    count: bucket.count,
    name: bucket.name,
    PK: `JUDGE#${bucket.year}`,
    SK: bucket.judgeId,
    updatedAt,
  }))

const addRegistrationStats = (
  registration: RegistrationStatsInput,
  event: EventStatsEvent,
  year: number,
  updatedAt: string,
  accumulator: StatsAccumulator,
  wanted: Set<StatsPartition>
) => {
  accumulator.years.add(year)
  if (wanted.has('organizer')) updateOrganizerStats(accumulator.organizerStats, event, registration, updatedAt)

  if (!wanted.has('participation') || !OFFICIAL_EVENT_TYPES.includes(event.eventType)) return

  const yearlyCounts = getYearlyCounts(accumulator.yearlyStats, year)
  const identifiers = participationIdentifiers(registration)
  for (const type of PARTICIPATION_TYPES) increment(countsForType(yearlyCounts, type), identifiers[type])

  const handlerDogs = getHandlerDogs(accumulator.handlerDogsByYear, year)
  const dogsForHandler = handlerDogs.get(identifiers.handler) ?? new Set<string>()
  dogsForHandler.add(identifiers.dog)
  handlerDogs.set(identifiers.handler, dogsForHandler)
}

/**
 * Processes one registration into the accumulator/capacity buckets. Returns whether it had to be
 * skipped (unresolvable event/year) and, when capacity is wanted, whether it couldn't be
 * attributed to a capacity bucket.
 */
const processRegistrationStats = (
  registration: CapacityRegistrationInput,
  eventsById: Map<string, EventStatsEvent>,
  updatedAt: string,
  accumulator: StatsAccumulator,
  wanted: Set<StatsPartition>,
  capacityBuckets: Map<string, CapacityBucket>,
  eventClassMonths: Map<string, Map<string, string>>,
  breedStartBuckets: Map<string, BreedStartBucket>,
  eventBreakdownBuckets: Map<string, EventBreakdownBucket>
): { skipped: boolean; unattributedCapacity: boolean } => {
  const event = eventsById.get(registration.eventId)
  const year = event && eventStatsYear(event)
  if (!event || year === undefined) {
    console.log(`Skipping registration ${registration.id}: event is missing or has an invalid start date`)
    return { skipped: true, unattributedCapacity: false }
  }
  addRegistrationStats(registration, event, year, updatedAt, accumulator, wanted)
  if (wanted.has('participation')) addBreedStartRegistration(registration, event, year, breedStartBuckets)
  if (wanted.has('eventBreakdown')) addEventBreakdownRegistration(registration, event, year, eventBreakdownBuckets)
  const unattributedCapacity =
    wanted.has('capacity') && !addCapacityRegistration(registration, event, capacityBuckets, eventClassMonths)
  return { skipped: false, unattributedCapacity }
}

/**
 * Allocates the per-partition buckets, seeding the ones that start from the events themselves
 * rather than from registrations.
 */
const seedStatsBuckets = (
  eventsById: Map<string, EventStatsEvent>,
  wanted: Set<StatsPartition>,
  yearlyStats: Map<number, Map<YearlyStatTypes, Map<string, number>>>
) => {
  const capacityBuckets = new Map<string, CapacityBucket>()
  const eventClassMonths = new Map<string, Map<string, string>>()
  if (wanted.has('capacity')) seedCapacityFromEvents(eventsById, capacityBuckets, eventClassMonths)

  const judgeWorkloadBuckets = new Map<string, JudgeWorkloadBucket>()
  if (wanted.has('judges')) seedJudgeWorkloadFromEvents(eventsById, judgeWorkloadBuckets)

  if (wanted.has('participation')) seedEventCountsFromEvents(eventsById, yearlyStats)

  const breedStartBuckets = new Map<string, BreedStartBucket>()

  const eventBreakdownBuckets = new Map<string, EventBreakdownBucket>()
  if (wanted.has('eventBreakdown')) seedEventBreakdownFromEvents(eventsById, eventBreakdownBuckets)

  return { breedStartBuckets, capacityBuckets, eventBreakdownBuckets, eventClassMonths, judgeWorkloadBuckets }
}

/** Builds the desired contents of the given stats partitions without making DynamoDB writes. */
export function buildStatsRecords(
  registrations: CapacityRegistrationInput[],
  eventsById: Map<string, EventStatsEvent>,
  updatedAt: string,
  partitions: StatsPartition[] = ALL_STATS_PARTITIONS
): {
  records: (
    | JsonEventStatsItem
    | JsonCapacityStatsItem
    | JsonJudgeWorkloadItem
    | JsonBreedStartStatsItem
    | JsonEventBreakdownItem
  )[]
  skippedCount: number
  unattributedCapacityCount: number
} {
  const wanted = new Set(partitions)
  const organizerStats = new Map<string, JsonEventStatsItem>()
  const yearlyStats = new Map<number, Map<YearlyStatTypes, Map<string, number>>>()
  const handlerDogsByYear = new Map<number, Map<string, Set<string>>>()
  const years = new Set<number>()
  const accumulator = { handlerDogsByYear, organizerStats, yearlyStats, years }
  let skippedCount = 0
  let unattributedCapacityCount = 0

  const { breedStartBuckets, capacityBuckets, eventBreakdownBuckets, eventClassMonths, judgeWorkloadBuckets } =
    seedStatsBuckets(eventsById, wanted, yearlyStats)

  for (const registration of registrations) {
    const outcome = processRegistrationStats(
      registration,
      eventsById,
      updatedAt,
      accumulator,
      wanted,
      capacityBuckets,
      eventClassMonths,
      breedStartBuckets,
      eventBreakdownBuckets
    )
    if (outcome.skipped) skippedCount++
    if (outcome.unattributedCapacity) unattributedCapacityCount++
  }

  const records: (
    | JsonEventStatsItem
    | JsonCapacityStatsItem
    | JsonJudgeWorkloadItem
    | JsonBreedStartStatsItem
    | JsonEventBreakdownItem
  )[] = [
    ...(wanted.has('organizer') ? organizerStats.values() : []),
    ...(wanted.has('participation') ? yearlyStatsRecords(yearlyStats, handlerDogsByYear) : []),
    ...(wanted.has('participation') ? breedStartRecords(breedStartBuckets, updatedAt) : []),
    ...(wanted.has('capacity') ? capacityStatsRecords(capacityBuckets, updatedAt) : []),
    ...(wanted.has('judges') ? judgeWorkloadRecords(judgeWorkloadBuckets, updatedAt) : []),
    ...(wanted.has('eventBreakdown') ? eventBreakdownRecords(eventBreakdownBuckets, updatedAt) : []),
  ]

  // The YEARS marker belongs to the participation partition (see getStatsRecordPartition).
  if (wanted.has('participation')) {
    for (const year of years) records.push({ PK: 'YEARS', SK: year.toString(), updatedAt })
  }
  return { records, skippedCount, unattributedCapacityCount }
}

async function deleteStatsRecords(stats: EventStatKey[]): Promise<void> {
  for (const stat of stats) {
    if (!(await dynamoDB.delete({ PK: stat.PK, SK: stat.SK }))) {
      throw new Error(`Failed to delete stats record ${stat.PK}/${stat.SK}`)
    }
  }
}

const groupStatsByYear = <T extends EventStatKey>(records: T[]) => {
  const recordsByYear = new Map<number, T[]>()
  for (const record of records) {
    const year = getEventStatsRecordYear(record)
    if (year === undefined) continue
    const recordsForYear = recordsByYear.get(year) ?? []
    recordsForYear.push(record)
    recordsByYear.set(year, recordsForYear)
  }
  return recordsByYear
}

export function createHandler(partitions: StatsPartition[] = ALL_STATS_PARTITIONS) {
  return async function handler(): Promise<void> {
    const wanted = new Set(partitions)
    console.log(`Starting stats regeneration for partitions: ${partitions.join(', ')}`)

    const [allEvents, registrations, allStatKeys] = await Promise.all([
      dynamoDB.readAll<EventStatsEvent>({
        names: EVENT_STATS_PROJECTION_NAMES,
        projection: EVENT_STATS_PROJECTION,
        table: CONFIG.eventTable,
      }),
      dynamoDB.readAll<CapacityRegistrationInput>({
        names: REGISTRATION_STATS_PROJECTION_NAMES,
        projection: REGISTRATION_STATS_PROJECTION,
        table: CONFIG.registrationTable,
      }),
      dynamoDB.readAll<EventStatKey>({ projection: 'PK, SK' }),
    ])
    const events = allEvents || []
    const registrationRecords = registrations || []
    const everyStatKey = allStatKeys || []
    // Only ever delete keys in the partitions this run owns; anything else is left untouched.
    const statKeys = everyStatKey.filter((key) => {
      const partition = getStatsRecordPartition(key)
      return partition !== undefined && wanted.has(partition)
    })
    const eventsById = new Map(events.map((event) => [event.id, event]))
    const { records, skippedCount, unattributedCapacityCount } = buildStatsRecords(
      registrationRecords,
      eventsById,
      new Date().toISOString(),
      partitions
    )
    const existingStatsByYear = groupStatsByYear(statKeys)
    const recordsByYear = groupStatsByYear(records)
    // Counted across the whole table, not just this run's scope: a record no rebuild can place by
    // year is never refreshed or deleted by anyone, so it leaks regardless of which run finds it.
    const unclassifiedStatsCount = everyStatKey.filter((key) => getEventStatsRecordYear(key) === undefined).length
    const years = [...new Set([...existingStatsByYear.keys(), ...recordsByYear.keys()])].sort((a, b) => a - b)

    console.log(
      `Found ${events.length} events, ${registrationRecords.length} registrations, ${statKeys.length} stats records in scope, rebuilding ${records.length} records`
    )
    for (const year of years) {
      const oldRecords = existingStatsByYear.get(year) ?? []
      const newRecords = recordsByYear.get(year) ?? []
      // Write before deleting, and only delete keys the rebuild did not regenerate. Deleting
      // first left a window where /stats served empty or partial data for the year -- which the
      // public endpoint then caches for up to an hour. batchWrite overwrites in place, so every
      // surviving key stays continuously readable and only genuinely-gone keys are removed.
      const newKeys = new Set(newRecords.map((record) => `${record.PK}\u0000${record.SK}`))
      const staleRecords = oldRecords.filter((record) => !newKeys.has(`${record.PK}\u0000${record.SK}`))
      // Keep each year independently regenerable if a manual run fails midway.
      if (newRecords.length > 0) await dynamoDB.batchWrite(newRecords)
      await deleteStatsRecords(staleRecords)
      console.log(
        `Regenerated ${year}: wrote ${newRecords.length} records and removed ${staleRecords.length} stale stats`
      )
    }

    console.log(
      `Stats regeneration completed. Records: ${records.length}, Skipped: ${skippedCount}, Unclassified stats: ${unclassifiedStatsCount}, Registrations without a capacity class: ${unattributedCapacityCount}`
    )
    // Matched by RebuildStatsFunctionUnattributedCapacityMetricFilter in rebuild-stats.yaml: a
    // dropped registration otherwise has no signal short of grepping this log by hand.
    if (unattributedCapacityCount > 0) {
      console.warn(
        `Stats rebuild found ${unattributedCapacityCount} registrations it could not attribute to a capacity class`
      )
    }
  }
}
