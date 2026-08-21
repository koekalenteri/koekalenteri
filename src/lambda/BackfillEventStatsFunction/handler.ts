// Despite its deployed name, this manual function regenerates all statistics from registrations.
import type { JsonConfirmedEvent } from '../../types'
import type { JsonEventStatsItem, YearlyStatTypes } from '../../types/Stats'
import type { RegistrationStatsInput } from '../lib/stats'
import { OFFICIAL_EVENT_TYPES } from '../../lib/event'
import { CONFIG } from '../config'
import { bucketForCount, eventStatsYear, participationIdentifiers } from '../lib/stats'
import CustomDynamoClient from '../utils/CustomDynamoClient'

interface EventStatKey {
  PK: string
  SK: string
}

type EventStatsEvent = Pick<JsonConfirmedEvent, 'eventType' | 'id' | 'startDate'> & { organizer: { id: string } }

const REGISTRATION_STATS_PROJECTION_NAMES = { '#handler': 'handler', '#owner': 'owner' }
const REGISTRATION_STATS_PROJECTION =
  'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #owner.email'
const PARTICIPATION_TYPES: YearlyStatTypes[] = ['eventType', 'dog', 'breed', 'handler', 'owner', 'dog#handler']

const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)

/** Returns the year represented by a stats-table key, if it is a stats record. */
export function getEventStatsRecordYear({ PK, SK }: EventStatKey): number | undefined {
  const match =
    /^(?:STAT|TOTALS|BUCKETS)#(\d{4})(?:#|$)/.exec(PK) || (PK === 'YEARS' ? /^(\d{4})$/.exec(SK) : undefined)
  if (match) return Number(match[1])

  if (PK.startsWith('ORG#')) {
    const eventIdSeparator = SK.indexOf('#')
    return eventIdSeparator === -1 ? undefined : eventStatsYear({ startDate: SK.slice(0, eventIdSeparator) })
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

const eventStatsKey = (event: EventStatsEvent): EventStatKey => ({
  PK: `ORG#${event.organizer.id}`,
  SK: `${event.startDate}#${event.id}`,
})

const updateOrganizerStats = (
  organizerStats: Map<string, JsonEventStatsItem>,
  event: EventStatsEvent,
  registration: RegistrationStatsInput,
  updatedAt: string
) => {
  const key = eventStatsKey(event)
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

const addRegistrationStats = (
  registration: RegistrationStatsInput,
  event: EventStatsEvent,
  year: number,
  updatedAt: string,
  accumulator: StatsAccumulator
) => {
  accumulator.years.add(year)
  updateOrganizerStats(accumulator.organizerStats, event, registration, updatedAt)

  if (!OFFICIAL_EVENT_TYPES.includes(event.eventType)) return

  const yearlyCounts = getYearlyCounts(accumulator.yearlyStats, year)
  const identifiers = participationIdentifiers(registration)
  for (const type of PARTICIPATION_TYPES) increment(countsForType(yearlyCounts, type), identifiers[type])
}

/** Builds the complete desired stats-table contents without making DynamoDB writes. */
export function buildStatsRecords(
  registrations: RegistrationStatsInput[],
  eventsById: Map<string, EventStatsEvent>,
  updatedAt: string
): { records: JsonEventStatsItem[]; skippedCount: number } {
  const organizerStats = new Map<string, JsonEventStatsItem>()
  const yearlyStats = new Map<number, Map<YearlyStatTypes, Map<string, number>>>()
  const years = new Set<number>()
  const accumulator = { organizerStats, yearlyStats, years }
  let skippedCount = 0

  for (const registration of registrations) {
    const event = eventsById.get(registration.eventId)
    const year = event && eventStatsYear(event)
    if (!event || year === undefined) {
      console.log(`Skipping registration ${registration.id}: event is missing or has an invalid start date`)
      skippedCount++
      continue
    }
    addRegistrationStats(registration, event, year, updatedAt, accumulator)
  }

  const records: JsonEventStatsItem[] = [...organizerStats.values(), ...yearlyStatsRecords(yearlyStats)]

  for (const year of years) records.push({ PK: 'YEARS', SK: year.toString(), updatedAt })
  return { records, skippedCount }
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

export function createHandler() {
  return async function handler(): Promise<void> {
    console.log('Starting event stats regeneration...')

    const [allEvents, registrations, allStatKeys] = await Promise.all([
      dynamoDB.readAll<JsonConfirmedEvent>({
        projection: 'id, organizer, startDate, eventType',
        table: CONFIG.eventTable,
      }),
      dynamoDB.readAll<RegistrationStatsInput>({
        names: REGISTRATION_STATS_PROJECTION_NAMES,
        projection: REGISTRATION_STATS_PROJECTION,
        table: CONFIG.registrationTable,
      }),
      dynamoDB.readAll<EventStatKey>({ projection: 'PK, SK' }),
    ])
    const events = allEvents || []
    const registrationRecords = registrations || []
    const statKeys = allStatKeys || []
    const eventsById = new Map(events.map((event) => [event.id, event]))
    const { records, skippedCount } = buildStatsRecords(registrationRecords, eventsById, new Date().toISOString())
    const existingStatsByYear = groupStatsByYear(statKeys)
    const recordsByYear = groupStatsByYear(records)
    const unclassifiedStatsCount = statKeys.length - [...existingStatsByYear.values()].flat().length
    const years = [...new Set([...existingStatsByYear.keys(), ...recordsByYear.keys()])].sort((a, b) => a - b)

    console.log(
      `Found ${events.length} events, ${registrationRecords.length} registrations, ${statKeys.length} stats records, rebuilding ${records.length} records`
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
      `Event stats regeneration completed. Records: ${records.length}, Skipped: ${skippedCount}, Unclassified stats: ${unclassifiedStatsCount}`
    )
  }
}

export default createHandler()
