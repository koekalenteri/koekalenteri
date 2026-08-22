// Rebuilds statistics from scratch out of the events and registrations tables.
//
// Two callers with different scopes share this: the manual RebuildAllStatsFunction rebuilds
// everything, and the scheduled RebuildStatsFunction rebuilds every partition except ORG#.
// ORG# is excluded from the scheduled run on purpose: it is the one partition still maintained
// incrementally on registration writes, and a delete-then-write pass over it would race those
// writes. Every other partition has exactly one writer — this module — so rebuilding is safe.
import type { EventState, JsonDogEvent, JsonRegistration } from '../../types'
import type { JsonCapacityStatsItem, JsonEventStatsItem, YearlyStatTypes } from '../../types/Stats'
import type { RegistrationStatsInput } from './stats'
import { OFFICIAL_EVENT_TYPES, uniqueClasses } from '../../lib/event'
import { getRegistrationClass, isParticipantGroup } from '../../lib/registration'
import { splitEvenly } from '../../lib/utils'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { bucketForCount, eventStatsMonth, eventStatsYear, organizerStatsKey, participationIdentifiers } from './stats'

interface EventStatKey {
  PK: string
  SK: string
}

export type EventStatsEvent = Pick<JsonDogEvent, 'classes' | 'eventType' | 'id' | 'places' | 'startDate' | 'state'> & {
  organizer: { id: string }
}

type CapacityRegistrationInput = RegistrationStatsInput & Pick<JsonRegistration, 'class' | 'group'>

const REGISTRATION_STATS_PROJECTION_NAMES = {
  '#class': 'class',
  '#group': 'group',
  '#handler': 'handler',
  '#key': 'key',
  '#owner': 'owner',
}
const REGISTRATION_STATS_PROJECTION =
  'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #owner.email, #class, #group.#key'
const EVENT_STATS_PROJECTION_NAMES = { '#state': 'state' }
const EVENT_STATS_PROJECTION = 'id, organizer, startDate, eventType, classes, places, #state'
const PARTICIPATION_TYPES: YearlyStatTypes[] = ['eventType', 'dog', 'breed', 'handler', 'owner', 'dog#handler']
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
type StatsPartition = 'organizer' | 'participation' | 'capacity'

export const ALL_STATS_PARTITIONS: StatsPartition[] = ['organizer', 'participation', 'capacity']
/** Everything the scheduled rebuild owns: safe to delete and rewrite while the site is live. */
export const REBUILDABLE_STATS_PARTITIONS: StatsPartition[] = ['participation', 'capacity']

export const getStatsRecordPartition = ({ PK }: EventStatKey): StatsPartition | undefined => {
  if (PK.startsWith('ORG#')) return 'organizer'
  if (PK.startsWith('CAPACITY#')) return 'capacity'
  if (PK === 'YEARS' || /^(?:STAT|TOTALS|BUCKETS)#/.test(PK)) return 'participation'
  return undefined
}

/** Returns the year represented by a stats-table key, if it is a stats record. */
export function getEventStatsRecordYear({ PK, SK }: EventStatKey): number | undefined {
  const match =
    /^(?:STAT|TOTALS|BUCKETS)#(\d{4})(?:#|$)/.exec(PK) || (PK === 'YEARS' ? /^(\d{4})$/.exec(SK) : undefined)
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
    organizerId: event.organizer.id,
    paidAmount: 0,
    paidRegistrations: 0,
    refundedAmount: 0,
    refundedRegistrations: 0,
    updatedAt,
  }
  stats.count = (stats.count ?? 0) + 1
  stats.cancelledRegistrations = (stats.cancelledRegistrations ?? 0) + (registration.cancelled ? 1 : 0)
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

const dogHandlerBucketRecords = (year: number, counts: Map<string, number>): JsonEventStatsItem[] => {
  const buckets = new Map<string, number>()
  for (const count of counts.values()) {
    const bucket = bucketForCount(count)
    if (bucket) increment(buckets, bucket)
  }
  return [...buckets].map(([bucket, count]) => ({ count, PK: `BUCKETS#${year}#dog#handler`, SK: bucket }))
}

const yearlyStatsRecords = (yearlyStats: Map<number, Map<YearlyStatTypes, Map<string, number>>>) => {
  const records: JsonEventStatsItem[] = []
  for (const [year, countsByType] of yearlyStats) {
    for (const type of PARTICIPATION_TYPES) {
      const counts = countsForType(countsByType, type)
      records.push({ count: counts.size, PK: `TOTALS#${year}`, SK: type })
      for (const [entityId, count] of counts) records.push({ count, PK: `STAT#${year}#${type}`, SK: entityId })
      if (type === 'dog#handler') records.push(...dogHandlerBucketRecords(year, counts))
    }
  }
  return records
}

interface StatsAccumulator {
  organizerStats: Map<string, JsonEventStatsItem>
  yearlyStats: Map<number, Map<YearlyStatTypes, Map<string, number>>>
  years: Set<number>
}

interface CapacityBucket {
  cancelledRegistrations: number
  classKey: string
  eventCount: number
  eventType: string
  month: string
  places: number
  reserve: number
  starters: number
}

const capacityBucketKey = (eventType: string, month: string, classKey: string) => `${eventType}#${month}#${classKey}`

const getOrCreateCapacityBucket = (
  buckets: Map<string, CapacityBucket>,
  eventType: string,
  month: string,
  classKey: string
): CapacityBucket => {
  const key = capacityBucketKey(eventType, month, classKey)
  const existing = buckets.get(key)
  if (existing) return existing

  const bucket: CapacityBucket = {
    cancelledRegistrations: 0,
    classKey,
    eventCount: 0,
    eventType,
    month,
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
    .sort()
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

      const bucket = getOrCreateCapacityBucket(buckets, event.eventType, month, classKey)
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
  const classKey = classMonths.has(registrationClass)
    ? registrationClass
    : classMonths.size === 1
      ? [...classMonths.keys()][0]
      : undefined
  const month = classKey && classMonths.get(classKey)
  if (!classKey || !month) return false

  const bucket = getOrCreateCapacityBucket(buckets, event.eventType, month, classKey)

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
    PK: `CAPACITY#${bucket.eventType}`,
    places: bucket.places,
    reserve: bucket.reserve,
    SK: `${bucket.month}#${bucket.classKey}`,
    starters: bucket.starters,
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
}

/** Builds the desired contents of the given stats partitions without making DynamoDB writes. */
export function buildStatsRecords(
  registrations: CapacityRegistrationInput[],
  eventsById: Map<string, EventStatsEvent>,
  updatedAt: string,
  partitions: StatsPartition[] = ALL_STATS_PARTITIONS
): {
  records: (JsonEventStatsItem | JsonCapacityStatsItem)[]
  skippedCount: number
  unattributedCapacityCount: number
} {
  const wanted = new Set(partitions)
  const organizerStats = new Map<string, JsonEventStatsItem>()
  const yearlyStats = new Map<number, Map<YearlyStatTypes, Map<string, number>>>()
  const years = new Set<number>()
  const accumulator = { organizerStats, yearlyStats, years }
  let skippedCount = 0
  let unattributedCapacityCount = 0

  const capacityBuckets = new Map<string, CapacityBucket>()
  const eventClassMonths = new Map<string, Map<string, string>>()
  if (wanted.has('capacity')) seedCapacityFromEvents(eventsById, capacityBuckets, eventClassMonths)

  for (const registration of registrations) {
    const event = eventsById.get(registration.eventId)
    const year = event && eventStatsYear(event)
    if (!event || year === undefined) {
      console.log(`Skipping registration ${registration.id}: event is missing or has an invalid start date`)
      skippedCount++
      continue
    }
    addRegistrationStats(registration, event, year, updatedAt, accumulator, wanted)
    if (wanted.has('capacity')) {
      if (!addCapacityRegistration(registration, event, capacityBuckets, eventClassMonths)) unattributedCapacityCount++
    }
  }

  const records: (JsonEventStatsItem | JsonCapacityStatsItem)[] = [
    ...(wanted.has('organizer') ? organizerStats.values() : []),
    ...(wanted.has('participation') ? yearlyStatsRecords(yearlyStats) : []),
    ...(wanted.has('capacity') ? capacityStatsRecords(capacityBuckets, updatedAt) : []),
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
      // Keep each year independently regenerable if a manual run fails midway.
      await deleteStatsRecords(oldRecords)
      if (newRecords.length > 0) await dynamoDB.batchWrite(newRecords)
      console.log(
        `Regenerated ${year}: removed ${oldRecords.length} existing stats and wrote ${newRecords.length} records`
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
