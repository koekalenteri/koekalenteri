import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import type { JsonConfirmedEvent, JsonRegistration } from '../../../types'
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

const { eventStatsTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventStatsTable)

type StatsTransactionItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number]

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

/** Identifies an event's organizer stats row. Both key parts are editable event fields. */
export type OrganizerStatsEvent = Pick<JsonConfirmedEvent, 'id' | 'startDate'> & { organizer: { id: string } }

/** How much one registration change moves each organizer counter. */
export interface StatDeltas {
  cancelledDelta: number
  memberDelta: number
  paidAmountDelta: number
  paidDelta: number
  refundedAmountDelta: number
  refundedDelta: number
  reserveDelta: number
  totalDelta: number
}

/** The participation bucket partitions of a year. */
export type BucketPartition = 'dog#handler' | 'dogsPerHandler'

export const organizerStatsKey = (event: OrganizerStatsEvent) => ({
  PK: `ORG#${event.organizer.id}`,
  SK: `${event.startDate}#${event.id}`,
})

/** Every counter an organizer stats row carries, as the update expressions name them. */
const ORGANIZER_STATS_NAMES = {
  '#cancelledRegistrations': 'cancelledRegistrations',
  '#count': 'count',
  '#date': 'date',
  '#memberRegistrations': 'memberRegistrations',
  '#organizerId': 'organizerId',
  '#paidAmount': 'paidAmount',
  '#paidRegistrations': 'paidRegistrations',
  '#refundedAmount': 'refundedAmount',
  '#refundedRegistrations': 'refundedRegistrations',
  '#reserveRegistrations': 'reserveRegistrations',
  '#updatedAt': 'updatedAt',
}

const queryPartition = async <T extends object>(pk: string): Promise<T[]> =>
  (await dynamoDB.query<T>({ key: 'PK = :pk', values: { ':pk': pk } })) ?? []

/** Date range filter on the organizer rows' sort key, which starts with the event's start date. */
function buildDateRangeFilters(from?: string, to?: string) {
  const filterExpressions: string[] = []
  const expressionValues: Record<string, string> = {}

  if (from) {
    filterExpressions.push('SK >= :from')
    expressionValues[':from'] = from
  }

  if (to) {
    filterExpressions.push('SK <= :to')
    expressionValues[':to'] = to
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
  const expressionValues: Record<string, string> = { ':pk': `ORG#${organizerId}` }
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
  const expressionValues: Record<string, string> = { ':orgPrefix': 'ORG#' }
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
export const readYearlyTotals = async (year: number) => queryPartition<StatCountRow>(`TOTALS#${year}`)

/** The year's new and returning dog+handler pair counts. */
export const readRetention = async (year: number) => queryPartition<StatCountRow>(`RETENTION#${year}`)

/** The year's per-entity participation counts of one type. */
export const readYearlyBreakdown = async (year: number, type: YearlyBreakdownType) =>
  queryPartition<StatCountRow>(`STAT#${year}#${type}`)

/** The year's starters and reserve per breed. */
export const readBreedStarts = async (year: number) =>
  queryPartition<Pick<JsonBreedStartStatsItem, 'SK' | 'reserve' | 'starters'>>(`STAT#${year}#breedStart`)

/** The year's bucketed counts of one bucket partition. */
export const readBuckets = async (year: number, partition: BucketPartition) =>
  queryPartition<StatCountRow>(`BUCKETS#${year}#${partition}`)

/** The years that have statistics, one row per year in the sort key. */
export const readStatsYears = async () => queryPartition<Pick<EventStatKey, 'SK'>>('YEARS')

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
  const values: Record<string, string> = { ':pk': `CAPACITY#${eventType}` }

  if (from && to) {
    keyCondition += ' AND SK BETWEEN :from AND :to'
    values[':from'] = from
    values[':to'] = `${to}#￿`
  } else if (from) {
    keyCondition += ' AND SK >= :from'
    values[':from'] = from
  } else if (to) {
    keyCondition += ' AND SK <= :to'
    values[':to'] = `${to}#￿`
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
  const values: Record<string, string> = { ':pk': `JUDGE#${year}` }
  const items = await dynamoDB.query<JsonJudgeWorkloadItem>({
    filterExpression: organizerFilterExpression(organizerIds, names, values),
    key: '#pk = :pk',
    names,
    values,
  })

  return items ?? []
}

/** The year's club + event type breakdown rows. */
export const readEventBreakdown = async (year: number) => queryPartition<JsonEventBreakdownItem>(`BREAKDOWN#${year}`)

/** Adds the deltas to the event's organizer stats row, creating the row when there is none. */
export async function addOrganizerEventStats(
  event: OrganizerStatsEvent,
  deltas: StatDeltas,
  updatedAt: string
): Promise<void> {
  await dynamoDB.update(organizerStatsKey(event), {
    add: {
      cancelledRegistrations: deltas.cancelledDelta,
      count: deltas.totalDelta,
      memberRegistrations: deltas.memberDelta,
      paidAmount: deltas.paidAmountDelta,
      paidRegistrations: deltas.paidDelta,
      refundedAmount: deltas.refundedAmountDelta,
      refundedRegistrations: deltas.refundedDelta,
      reserveRegistrations: deltas.reserveDelta,
    },
    set: {
      date: event.startDate,
      organizerId: event.organizer.id,
      updatedAt,
    },
  })
}

/** The event's organizer stats row as last written, or undefined when nothing has been counted yet. */
export const readOrganizerEventStatsRow = async (event: OrganizerStatsEvent) =>
  dynamoDB.read<JsonEventStatsItem>(organizerStatsKey(event), undefined, true)

/**
 * Moves the counters read from the existing event's row onto the updated event's row in one
 * transaction. The destination is added to, not overwritten: a registration for the updated event
 * can already have created it with a blind ADD. The delete of the source is conditioned on the
 * `updatedAt` read, so a registration write landing on it in between cancels the transaction
 * instead of being discarded.
 */
export async function moveOrganizerEventStatsRow(
  existing: OrganizerStatsEvent,
  updated: OrganizerStatsEvent,
  stats: JsonEventStatsItem,
  updatedAt: string
): Promise<void> {
  await dynamoDB.documentTransaction([
    {
      Update: {
        ExpressionAttributeNames: ORGANIZER_STATS_NAMES,
        ExpressionAttributeValues: {
          ':cancelledRegistrations': stats.cancelledRegistrations ?? 0,
          ':count': stats.count ?? 0,
          ':date': updated.startDate,
          ':memberRegistrations': stats.memberRegistrations ?? 0,
          ':organizerId': updated.organizer.id,
          ':paidAmount': stats.paidAmount ?? 0,
          ':paidRegistrations': stats.paidRegistrations ?? 0,
          ':refundedAmount': stats.refundedAmount ?? 0,
          ':refundedRegistrations': stats.refundedRegistrations ?? 0,
          ':reserveRegistrations': stats.reserveRegistrations ?? 0,
          ':updatedAt': updatedAt,
        },
        Key: organizerStatsKey(updated),
        TableName: eventStatsTable,
        UpdateExpression:
          'ADD #cancelledRegistrations :cancelledRegistrations, #count :count, #memberRegistrations :memberRegistrations, #paidAmount :paidAmount, #paidRegistrations :paidRegistrations, #refundedAmount :refundedAmount, #refundedRegistrations :refundedRegistrations, #reserveRegistrations :reserveRegistrations SET #date = :date, #organizerId = :organizerId, #updatedAt = :updatedAt',
      },
    },
    {
      Delete: {
        ConditionExpression: stats.updatedAt ? '#updatedAt = :expectedUpdatedAt' : 'attribute_not_exists(#updatedAt)',
        ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: stats.updatedAt ? { ':expectedUpdatedAt': stats.updatedAt } : undefined,
        Key: organizerStatsKey(existing),
        TableName: eventStatsTable,
      },
    },
  ])
}

const organizerStatsTransactionItem = (
  event: OrganizerStatsEvent,
  deltas: StatDeltas,
  updatedAt: string
): StatsTransactionItem => ({
  Update: {
    ExpressionAttributeNames: ORGANIZER_STATS_NAMES,
    ExpressionAttributeValues: {
      ':cancelledDelta': deltas.cancelledDelta,
      ':date': event.startDate,
      ':memberDelta': deltas.memberDelta,
      ':organizerId': event.organizer.id,
      ':paidAmountDelta': deltas.paidAmountDelta,
      ':paidDelta': deltas.paidDelta,
      ':refundedAmountDelta': deltas.refundedAmountDelta,
      ':refundedDelta': deltas.refundedDelta,
      ':reserveDelta': deltas.reserveDelta,
      ':totalDelta': deltas.totalDelta,
      ':updatedAt': updatedAt,
    },
    Key: organizerStatsKey(event),
    TableName: eventStatsTable,
    UpdateExpression:
      'ADD #cancelledRegistrations :cancelledDelta, #count :totalDelta, #memberRegistrations :memberDelta, #paidAmount :paidAmountDelta, #paidRegistrations :paidDelta, #refundedAmount :refundedAmountDelta, #refundedRegistrations :refundedDelta, #reserveRegistrations :reserveDelta SET #date = :date, #organizerId = :organizerId, #updatedAt = :updatedAt',
  },
})

/**
 * Adds a new registration's deltas to the event's organizer stats row and marks the registration
 * counted, in one transaction. The marker is conditioned on the registration existing, not being
 * counted yet and still holding the caller's lease; the organizer row has no condition of its own.
 */
export async function commitNewRegistrationStats(
  event: OrganizerStatsEvent,
  deltas: StatDeltas,
  registration: Pick<JsonRegistration, 'eventId' | 'id'>,
  leaseToken: string,
  updatedAt: string
): Promise<void> {
  await dynamoDB.documentTransaction([
    organizerStatsTransactionItem(event, deltas, updatedAt),
    {
      Update: {
        ConditionExpression: 'attribute_exists(#id) AND attribute_not_exists(#statsAt) AND #lease.#token = :leaseToken',
        ExpressionAttributeNames: {
          '#id': 'id',
          '#lease': 'newRegistrationLease',
          '#statsAt': 'newRegistrationStatsAt',
          '#token': 'token',
        },
        ExpressionAttributeValues: { ':leaseToken': leaseToken, ':statsAt': updatedAt },
        Key: { eventId: registration.eventId, id: registration.id },
        TableName: registrationTable,
        UpdateExpression: 'SET #statsAt = :statsAt',
      },
    },
  ])
}

/** The key of every stats row in the table. */
export const readAllStatKeys = async (): Promise<EventStatKey[]> =>
  (await dynamoDB.readAll<EventStatKey>({ projection: 'PK, SK' })) ?? []

/**
 * Puts the rows, overwriting each key in place. The rebuild (`buildStatsRecords` in
 * `lib/statsRebuild.ts`) still builds the rows with their PK and SK itself, until KOE-1348 moves
 * the stats computation; this function only writes what it is given.
 */
export const writeStatRecords = async (records: EventStatKey[]) => dynamoDB.batchWrite(records)

/** Deletes the rows of the keys. */
export const deleteStatRecords = async (keys: EventStatKey[]) =>
  dynamoDB.batchDelete(keys.map(({ PK, SK }) => ({ PK, SK })))
