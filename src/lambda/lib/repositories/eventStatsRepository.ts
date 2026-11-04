import type { JsonConfirmedEvent } from '../../../types'
import type {
  JsonBreedStartStatsItem,
  JsonCapacityStatsItem,
  JsonEventBreakdownItem,
  JsonEventStatsItem,
  JsonJudgeWorkloadItem,
  YearlyBreakdownType,
} from '../../../types/Stats'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)

/** The key of a stats row: the partition names the statistic and its year, the sort key the entry. */
export interface EventStatKey {
  PK: string
  SK: string
}

/** A row of a partition that counts one thing per entry (a type, a breed, a bucket). */
export interface StatCountRow {
  SK: string
  count: number
}

/**
 * Identifies an event's organizer stats row. Both key parts are editable event fields: the rebuild
 * writes the row under what the event holds now and deletes the key it held before.
 */
export type OrganizerStatsEvent = Pick<JsonConfirmedEvent, 'id'> & { organizer: { id: string }; startDate: string }

/** The participation bucket partitions of a year. */
export type BucketPartition = 'dog#handler' | 'dogsPerHandler'

/**
 * The partition key prefixes, one per family of stats rows. Each partition key below starts with
 * one of them, followed by the year (or the event type, or the organizer) it holds.
 */
export const STATS_KEY_PREFIX = {
  breakdown: 'BREAKDOWN#',
  buckets: 'BUCKETS#',
  capacity: 'CAPACITY#',
  judge: 'JUDGE#',
  organizer: 'ORG#',
  retention: 'RETENTION#',
  stat: 'STAT#',
  totals: 'TOTALS#',
} as const

/** The partition holding one row per year that has statistics, the year in the sort key. */
export const YEARS_PK = 'YEARS'

/** The year's participation totals, one row per statistic type. */
export const yearlyTotalsPk = (year: number) => `${STATS_KEY_PREFIX.totals}${year}`

/** The year's new and returning dog+handler pairs. */
export const retentionPk = (year: number) => `${STATS_KEY_PREFIX.retention}${year}`

/** The year's per-entity counts of one statistic type, or the starters per breed (`breedStart`). */
export const yearlyStatPk = (year: number, type: string) => `${STATS_KEY_PREFIX.stat}${year}#${type}`

/** The year's bucketed counts of one bucket partition. */
export const bucketsPk = (year: number, partition: BucketPartition) => `${STATS_KEY_PREFIX.buckets}${year}#${partition}`

/** The monthly capacity rows of one event type. */
export const capacityPk = (eventType: string) => `${STATS_KEY_PREFIX.capacity}${eventType}`

/** The year's per-organizer, per-judge event counts. */
export const judgeWorkloadPk = (year: number) => `${STATS_KEY_PREFIX.judge}${year}`

/** The year's club + event type breakdown. */
export const eventBreakdownPk = (year: number) => `${STATS_KEY_PREFIX.breakdown}${year}`

/** One organizer's event rows. */
export const organizerPk = (organizerId: string) => `${STATS_KEY_PREFIX.organizer}${organizerId}`

/** A capacity row: the month, the class and the organizer, so the rows sort by month. */
export const capacitySk = (month: string, classKey: string, organizerId: string) =>
  `${month}#${classKey}#${organizerId}`

/** A bound past every capacity sort key of the month, whatever class and organizer follow it. */
const capacityMonthEnd = (month: string) => `${month}#\uffff`

export const organizerStatsKey = (event: OrganizerStatsEvent) => ({
  PK: organizerPk(event.organizer.id),
  SK: `${event.startDate}#${event.id}`,
})

const queryPartition = async <T extends object>(pk: string): Promise<T[]> =>
  (await dynamoDB.query<T>({ key: 'PK = :pk', values: { ':pk': pk } })) ?? []

/**
 * Date range filter on the organizer rows' sort key, which starts with the event's start day
 * (`yyyy-MM-dd#eventId`, KOE-1547). The upper bound is padded past the event id, so the events of the
 * range's last day are in it.
 */
function buildDateRangeFilters(from?: string, to?: string) {
  const filterExpressions: string[] = []
  const expressionValues: Record<string, string> = {}

  if (from) {
    filterExpressions.push('SK >= :from')
    expressionValues[':from'] = from
  }

  if (to) {
    filterExpressions.push('SK <= :to')
    expressionValues[':to'] = `${to}\uffff`
  }

  return { expressionValues, filterExpressions }
}

/**
 * `organizerId IN (...)` filter over a partition whose rows carry an `organizerId` attribute,
 * registering the placeholders it needs in `names` / `values`. Undefined means no filter (every
 * organizer); an empty list is the caller's job to short-circuit before querying at all.
 */
const organizerFilterExpression = (
  organizerIds: string[] | undefined,
  names: Record<string, string>,
  values: Record<string, string>
): string | undefined => {
  if (!organizerIds) return undefined
  names['#organizerId'] = 'organizerId'
  const placeholders = organizerIds.map((id, index) => {
    values[`:organizerId${index}`] = id
    return `:organizerId${index}`
  })
  return `#organizerId IN (${placeholders.join(', ')})`
}

/** One organizer's event rows, optionally only the events starting within the range. */
export async function readOrganizerEventStats(
  organizerId: string,
  from?: string,
  to?: string
): Promise<Required<JsonEventStatsItem>[]> {
  const expressionValues: Record<string, string> = { ':pk': organizerPk(organizerId) }
  const { filterExpressions, expressionValues: dateValues } = buildDateRangeFilters(from, to)
  Object.assign(expressionValues, dateValues)

  const items = await dynamoDB.query<Required<JsonEventStatsItem>>({
    filterExpression: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
    key: '#pk = :pk',
    names: { '#pk': 'PK' },
    values: expressionValues,
  })

  return items ?? []
}

/** Every organizer's event rows, optionally only the events starting within the range. */
export async function readAllOrganizerEventStats(from?: string, to?: string): Promise<Required<JsonEventStatsItem>[]> {
  const filterExpressions: string[] = ['begins_with(#pk, :orgPrefix)']
  const expressionValues: Record<string, string> = { ':orgPrefix': STATS_KEY_PREFIX.organizer }
  const { filterExpressions: dateFilters, expressionValues: dateValues } = buildDateRangeFilters(from, to)
  filterExpressions.push(...dateFilters)
  Object.assign(expressionValues, dateValues)

  const items = await dynamoDB.readAll<Required<JsonEventStatsItem>>({
    filter: filterExpressions.join(' AND '),
    names: { '#pk': 'PK' },
    values: expressionValues,
  })

  return items ?? []
}

/** The year's participation totals, one row per statistic type. */
export const readYearlyTotals = async (year: number) => queryPartition<StatCountRow>(yearlyTotalsPk(year))

/** The year's new and returning dog+handler pair counts. */
export const readRetention = async (year: number) => queryPartition<StatCountRow>(retentionPk(year))

/** The year's per-entity participation counts of one type. */
export const readYearlyBreakdown = async (year: number, type: YearlyBreakdownType) =>
  queryPartition<StatCountRow>(yearlyStatPk(year, type))

/** The year's starters and reserve per breed. */
export const readBreedStarts = async (year: number) =>
  queryPartition<Pick<JsonBreedStartStatsItem, 'SK' | 'reserve' | 'starters'>>(yearlyStatPk(year, 'breedStart'))

/** The year's bucketed counts of one bucket partition. */
export const readBuckets = async (year: number, partition: BucketPartition) =>
  queryPartition<StatCountRow>(bucketsPk(year, partition))

/** The years that have statistics, one row per year in the sort key. */
export const readStatsYears = async () => queryPartition<Pick<EventStatKey, 'SK'>>(YEARS_PK)

/**
 * The monthly capacity rows of one event type, optionally bounded to a yyyy-mm month range and to
 * some organizers. Uses a key condition (not a filter) since SK = {yyyy-mm}#{class}#{organizerId}
 * sorts naturally within the partition; the upper bound is padded past '#' so the whole `to` month
 * is included regardless of the class/organizer that follows it. DynamoDB rejects an inverted
 * BETWEEN with a ValidationException, so the caller answers an inverted range itself.
 */
export async function readCapacityStats(
  eventType: string,
  organizerIds?: string[],
  from?: string,
  to?: string
): Promise<JsonCapacityStatsItem[]> {
  let keyCondition = '#pk = :pk'
  const names: Record<string, string> = { '#pk': 'PK' }
  const values: Record<string, string> = { ':pk': capacityPk(eventType) }

  if (from && to) {
    keyCondition += ' AND SK BETWEEN :from AND :to'
    values[':from'] = from
    values[':to'] = capacityMonthEnd(to)
  } else if (from) {
    keyCondition += ' AND SK >= :from'
    values[':from'] = from
  } else if (to) {
    keyCondition += ' AND SK <= :to'
    values[':to'] = capacityMonthEnd(to)
  }

  const items = await dynamoDB.query<JsonCapacityStatsItem>({
    filterExpression: organizerFilterExpression(organizerIds, names, values),
    key: keyCondition,
    names,
    values,
  })

  return items ?? []
}

/** The year's per-organizer, per-judge event counts, optionally only some organizers' rows. */
export async function readJudgeWorkload(year: number, organizerIds?: string[]): Promise<JsonJudgeWorkloadItem[]> {
  const names: Record<string, string> = { '#pk': 'PK' }
  const values: Record<string, string> = { ':pk': judgeWorkloadPk(year) }
  const items = await dynamoDB.query<JsonJudgeWorkloadItem>({
    filterExpression: organizerFilterExpression(organizerIds, names, values),
    key: '#pk = :pk',
    names,
    values,
  })

  return items ?? []
}

/** The year's club + event type breakdown rows. */
export const readEventBreakdown = async (year: number) => queryPartition<JsonEventBreakdownItem>(eventBreakdownPk(year))

/** The key of every stats row in the table. */
export const readAllStatKeys = async (): Promise<EventStatKey[]> =>
  (await dynamoDB.readAll<EventStatKey>({ projection: 'PK, SK' })) ?? []

/**
 * Puts the rows, overwriting each key in place. The rebuild (`buildStatsRecords` in
 * `lib/stats/rebuild.ts`) assembles the rows itself, keyed with the builders above; this function
 * only writes what it is given.
 */
export const writeStatRecords = async (records: EventStatKey[]) => dynamoDB.batchWrite(records)

/** Deletes the rows of the keys. */
export const deleteStatRecords = async (keys: EventStatKey[]) =>
  dynamoDB.batchDelete(keys.map(({ PK, SK }) => ({ PK, SK })))
