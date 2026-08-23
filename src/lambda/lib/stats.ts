import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import type { JsonConfirmedEvent, JsonEventType, JsonRegistration } from '../../types'
import type {
  BreedStartRateEntry,
  CapacityStatsEntry,
  JsonCapacityStatsItem,
  JsonEventStatsItem,
  JudgeWorkloadEntry,
  RetentionStats,
  YearlyStatTypes,
  YearlyTotalStat,
} from '../../types/Stats'
import crypto from 'node:crypto'
import { formatDate } from '../../i18n/dates'
import { getEventSeason } from '../../lib/event'
import { getRegistrationClass } from '../../lib/registration'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// Single global client for all DynamoDB operations
const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)
const NEW_REGISTRATION_STATS_MAX_ATTEMPTS = 12
const NEW_REGISTRATION_STATS_RETRY_BASE_MS = 10
const NEW_REGISTRATION_STATS_RETRY_MAX_MS = 500
const MOVE_ORGANIZER_STATS_MAX_ATTEMPTS = 8

type StatsTransactionItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number]

const isTransactionCancelled = (error: unknown) => (error as { name?: string }).name === 'TransactionCanceledException'

const waitForStatsRetry = (attempt: number) => {
  const maximumDelay = Math.min(
    NEW_REGISTRATION_STATS_RETRY_BASE_MS * 2 ** (attempt - 1),
    NEW_REGISTRATION_STATS_RETRY_MAX_MS
  )
  const delay = Math.floor(Math.random() * maximumDelay)
  return new Promise<void>((resolve) => setTimeout(resolve, delay))
}

export type RegistrationStatsInput = Pick<
  JsonRegistration,
  'cancelled' | 'class' | 'eventId' | 'eventType' | 'id' | 'paidAmount' | 'refundAmount'
> & {
  dog?: Pick<JsonRegistration['dog'], 'breedCode' | 'regNo'>
  handler?: Pick<NonNullable<JsonRegistration['handler']>, 'email'>
  owner?: Pick<NonNullable<JsonRegistration['owner']>, 'email'>
}

/** Returns the calendar year of an instant in the event timezone. */
export function eventStatsYear({ startDate }: { startDate: string }): number | undefined {
  const season = getEventSeason(startDate)
  return /^\d{4}$/.test(season) ? Number(season) : undefined
}

/**
 * Returns the yyyy-MM month of an instant in the event timezone. Dates are stored as UTC
 * instants (a Finnish midnight is `...T21:00:00.000Z` the day before), so slicing the raw
 * string would bucket every event starting on the 1st into the previous month.
 */
export function eventStatsMonth(date: string): string | undefined {
  const month = formatDate(date, 'yyyy-MM')
  return /^\d{4}-\d{2}$/.test(month) ? month : undefined
}

/**
 * Get stats for organizers, optionally filtered by date range
 * If organizerIds is provided, only stats for those organizers are returned
 * If organizerIds is not provided, stats for all organizers are returned
 */
/**
 * Build date range filter expressions for DynamoDB queries
 */
function buildDateRangeFilters(from?: string, to?: string) {
  const filterExpressions: string[] = []
  const expressionValues: Record<string, any> = {}

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
 * Query stats for a single organizer with optional date filtering
 */
async function queryOrganizerStats(
  organizerId: string,
  from?: string,
  to?: string
): Promise<Required<JsonEventStatsItem>[]> {
  const keyCondition = '#pk = :pk'
  const expressionNames: Record<string, string> = { '#pk': 'PK' }
  const expressionValues: Record<string, any> = { ':pk': `ORG#${organizerId}` }

  // Add date range filters
  const { filterExpressions, expressionValues: dateValues } = buildDateRangeFilters(from, to)
  Object.assign(expressionValues, dateValues)

  // Combine filter expressions if any
  const filterExpression = filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined

  // Query for this organizerId with date filters
  const items = await dynamoDB.query<Required<JsonEventStatsItem>>({
    filterExpression,
    key: keyCondition,
    names: expressionNames,
    values: expressionValues,
  })

  return items || []
}

/**
 * Query stats for all organizers with optional date filtering
 */
async function queryAllOrganizerStats(from?: string, to?: string): Promise<Required<JsonEventStatsItem>[]> {
  // Start with the base filter for all organizer records
  const filterExpressions: string[] = ['begins_with(#pk, :orgPrefix)']
  const expressionNames: Record<string, string> = { '#pk': 'PK' }
  const expressionValues: Record<string, any> = { ':orgPrefix': 'ORG#' }

  // Add date range filters
  const { filterExpressions: dateFilters, expressionValues: dateValues } = buildDateRangeFilters(from, to)
  filterExpressions.push(...dateFilters)
  Object.assign(expressionValues, dateValues)

  // Combine filter expressions
  const filterExpression = filterExpressions.join(' AND ')

  // Use readAll with filtering
  const items = await dynamoDB.readAll<Required<JsonEventStatsItem>>({
    filter: filterExpression,
    names: expressionNames,
    values: expressionValues,
  })

  return items || []
}

/**
 * Get stats for organizers, optionally filtered by date range
 * If organizerIds is provided, only stats for those organizers are returned
 * If organizerIds is not provided, stats for all organizers are returned
 */
export async function getOrganizerStats(
  organizerIds?: string[],
  from?: string,
  to?: string
): Promise<JsonEventStatsItem[]> {
  let allStats: Required<JsonEventStatsItem>[] = []

  // An explicit empty list means "no organizers the caller may see", not "all of them" -- a
  // non-admin who belongs to no organization must get nothing, not every organizer's stats.
  if (organizerIds?.length === 0) return []

  if (organizerIds) {
    // Query for specific organizers
    for (const organizerId of organizerIds) {
      const items = await queryOrganizerStats(organizerId, from, to)
      allStats = [...allStats, ...items]
    }
  } else {
    // Query for all organizers
    allStats = await queryAllOrganizerStats(from, to)
  }

  // Sort by date
  allStats.sort((a, b) => a.date.localeCompare(b.date))
  return allStats
}

/**
 * Get yearly total stats for a specific year
 */
export async function getYearlyTotalStats(year: number): Promise<YearlyTotalStat[]> {
  const pk = `TOTALS#${year}`
  const items = await dynamoDB.query<{ SK: string; count: number }>({
    key: 'PK = :pk',
    values: { ':pk': pk },
  })

  return (items || []).map((item) => ({
    count: item.count,
    type: item.SK as YearlyStatTypes,
    year,
  }))
}

/**
 * Retention for a year: how many dog+handler pairs were new and how many also competed the year
 * before. Written by the nightly rebuild, which is the only place both years' pair sets exist at
 * once. Undefined for the earliest year on record, which has nothing to compare against.
 */
export async function getRetentionStats(year: number): Promise<RetentionStats | undefined> {
  const items = await dynamoDB.query<{ SK: string; count: number }>({
    key: 'PK = :pk',
    values: { ':pk': `RETENTION#${year}` },
  })
  if (!items?.length) return undefined

  const countFor = (sk: string) => items.find((item) => item.SK === sk)?.count ?? 0
  return { new: countFor('new'), returning: countFor('returning'), year }
}

/**
 * Get the per-entity participation breakdown for a specific year and type
 */
export async function getYearlyBreakdown(
  year: number,
  type: YearlyStatTypes
): Promise<{ entityId: string; count: number }[]> {
  const pk = `STAT#${year}#${type}`
  const items = await dynamoDB.query<{ SK: string; count: number }>({
    key: 'PK = :pk',
    values: { ':pk': pk },
  })

  return (items || []).map((item) => ({
    count: item.count,
    entityId: item.SK,
  }))
}

/**
 * Starters vs. reserve per breed for a year: what share of each breed's non-cancelled entries
 * actually got a starting position. Written by the nightly rebuild, alongside breedBreakdown.
 */
export async function getBreedStartBreakdown(year: number): Promise<BreedStartRateEntry[]> {
  const pk = `STAT#${year}#breedStart`
  const items = await dynamoDB.query<{ SK: string; starters: number; reserve: number }>({
    key: 'PK = :pk',
    values: { ':pk': pk },
  })

  return (items || []).map((item) => ({
    entityId: item.SK,
    reserve: item.reserve ?? 0,
    starters: item.starters ?? 0,
  }))
}

/**
 * Get dog#handler buckets for a specific year
 */
export async function getDogHandlerBuckets(year: number): Promise<{ bucket: string; count: number }[]> {
  const pk = `BUCKETS#${year}#dog#handler`
  const items = await dynamoDB.query<{ SK: string; count: number }>({
    key: 'PK = :pk',
    values: { ':pk': pk },
  })

  return (items || []).map((item) => ({
    bucket: item.SK,
    count: item.count,
  }))
}

/**
 * Get dogs-per-handler buckets for a specific year: how many handlers ran 1 dog, 2 dogs, etc.
 */
export async function getDogsPerHandlerBuckets(year: number): Promise<{ bucket: string; count: number }[]> {
  const pk = `BUCKETS#${year}#dogsPerHandler`
  const items = await dynamoDB.query<{ SK: string; count: number }>({
    key: 'PK = :pk',
    values: { ':pk': pk },
  })

  return (items || []).map((item) => ({
    bucket: item.SK,
    count: item.count,
  }))
}

/**
 * Get available years for which we have statistics
 */
export async function getAvailableYears(): Promise<number[]> {
  const items = await dynamoDB.query<{ SK: string }>({
    key: 'PK = :pk',
    values: { ':pk': 'YEARS' },
  })

  if (!items || items.length === 0) {
    return []
  }

  // Convert SK (year as string) to numbers and sort
  return items.map((item) => Number.parseInt(item.SK, 10)).sort((a, b) => a - b)
}

/**
 * Get monthly available-places-vs-actual-starters stats for one event type,
 * optionally bounded to a yyyy-mm month range. Uses a key condition (not a
 * filter) since SK = {yyyy-mm}#{class}#{organizerId} sorts naturally within
 * the partition; the upper bound is padded past '#' so the whole `to` month
 * is included regardless of the class/organizer that follows it.
 *
 * One row per month/class comes back per organizer that ran events of this type, so the
 * result is always summed into one entry per month/class. `organizerIds` narrows which
 * organizers are counted; undefined means every organizer (the nationwide total the public
 * endpoint serves). Callers that pass a list are responsible for having authorized it --
 * per-organizer figures are only exposed through the admin endpoint.
 */
export async function getCapacityStats(
  eventType: string,
  organizerIds?: string[],
  from?: string,
  to?: string
): Promise<CapacityStatsEntry[]> {
  // An explicit empty list means "no organizers the caller may see", not "all of them".
  if (organizerIds?.length === 0) return []

  // DynamoDB rejects an inverted BETWEEN with a ValidationException; the range is simply empty.
  if (from && to && from > to) return []

  const pk = `CAPACITY#${eventType}`
  let keyCondition = '#pk = :pk'
  const names: Record<string, string> = { '#pk': 'PK' }
  const values: Record<string, string> = { ':pk': pk }

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

  let filterExpression: string | undefined
  if (organizerIds) {
    names['#organizerId'] = 'organizerId'
    filterExpression = `#organizerId IN (${organizerIds
      .map((id, index) => {
        values[`:organizerId${index}`] = id
        return `:organizerId${index}`
      })
      .join(', ')})`
  }

  const items = await dynamoDB.query<JsonCapacityStatsItem>({
    filterExpression,
    key: keyCondition,
    names,
    values,
  })

  const entries = (items || []).map((item) => {
    const [month, classKey] = item.SK.split('#')
    return {
      cancelledRegistrations: item.cancelledRegistrations ?? 0,
      class: classKey,
      eventCount: item.eventCount ?? 0,
      eventType,
      month,
      organizerId: item.organizerId ?? '',
      places: item.places ?? 0,
      reserve: item.reserve ?? 0,
      starters: item.starters ?? 0,
    }
  })
  // Only meaningful when the result covers exactly one organizer; otherwise it is a total.
  const resultOrganizerId = organizerIds?.length === 1 ? organizerIds[0] : ''
  const totalsByMonthAndClass = new Map<string, CapacityStatsEntry>()
  for (const entry of entries) {
    const key = `${entry.month}#${entry.class}`
    const total = totalsByMonthAndClass.get(key)
    if (!total) {
      totalsByMonthAndClass.set(key, { ...entry, organizerId: resultOrganizerId })
      continue
    }
    total.cancelledRegistrations += entry.cancelledRegistrations
    total.eventCount += entry.eventCount
    total.places += entry.places
    total.reserve += entry.reserve
    total.starters += entry.starters
  }
  return [...totalsByMonthAndClass.values()]
}

/**
 * Nationwide capacity stats summed across every active event type. Backs the public fill-rate
 * chart: a single type's places are set by competition rules, so only a cross-type aggregate
 * says anything about actual demand.
 */
export async function getCapacityStatsAllEventTypes(from?: string, to?: string): Promise<CapacityStatsEntry[]> {
  const eventTypes = await dynamoDB.readAll<JsonEventType>({ table: CONFIG.eventTypeTable })
  const activeEventTypes = (eventTypes ?? []).filter((eventType) => eventType.active).map((et) => et.eventType)

  const results = await Promise.all(
    activeEventTypes.map((eventType) => getCapacityStats(eventType, undefined, from, to))
  )
  return results.flat()
}

/**
 * Get per-judge event counts for a specific year: how many events each judge officiated.
 * Written by the nightly rebuild from the events table alone, independent of registrations.
 */
export async function getJudgeWorkload(year: number): Promise<JudgeWorkloadEntry[]> {
  const items = await dynamoDB.query<{ SK: string; name: string; count: number }>({
    key: 'PK = :pk',
    values: { ':pk': `JUDGE#${year}` },
  })

  return (items || []).map((item) => ({
    count: item.count,
    judgeId: item.SK,
    name: item.name,
  }))
}

/**
 * Calculate the deltas for various statistics based on registration changes
 */
export function calculateStatDeltas(
  registration: RegistrationStatsInput,
  existingRegistration: RegistrationStatsInput | undefined
) {
  return {
    cancelledDelta: (registration.cancelled ? 1 : 0) - (existingRegistration?.cancelled ? 1 : 0),
    paidAmountDelta: (registration.paidAmount ?? 0) - (existingRegistration?.paidAmount ?? 0),
    paidDelta: (registration.paidAmount ? 1 : 0) - (existingRegistration?.paidAmount ? 1 : 0),
    refundedAmountDelta: (registration.refundAmount ?? 0) - (existingRegistration?.refundAmount ?? 0),
    refundedDelta: (registration.refundAmount ? 1 : 0) - (existingRegistration?.refundAmount ? 1 : 0),
    totalDelta: existingRegistration ? 0 : 1,
  }
}

/** Identifies an event's organizer stats record. Both key parts are editable event fields. */
type OrganizerStatsEvent = Pick<JsonConfirmedEvent, 'id' | 'startDate'> & { organizer: { id: string } }

export const organizerStatsKey = (event: OrganizerStatsEvent) => ({
  PK: `ORG#${event.organizer.id}`,
  SK: `${event.startDate}#${event.id}`,
})

/**
 * Update the organizer event stats in DynamoDB
 */
export async function updateOrganizerEventStats(
  event: JsonConfirmedEvent,
  deltas: ReturnType<typeof calculateStatDeltas>
): Promise<void> {
  const key = organizerStatsKey(event)

  await dynamoDB.update(key, {
    add: {
      cancelledRegistrations: deltas.cancelledDelta,
      count: deltas.totalDelta,
      paidAmount: deltas.paidAmountDelta,
      paidRegistrations: deltas.paidDelta,
      refundedAmount: deltas.refundedAmountDelta,
      refundedRegistrations: deltas.refundedDelta,
    },
    set: {
      date: event.startDate,
      organizerId: event.organizer.id,
      updatedAt: new Date().toISOString(),
    },
  })
}

/**
 * Moves an event's accumulated organizer stats when an edit changes the record's key.
 *
 * The key embeds both the organizer and the start date, so editing either would strand the
 * counters under the old key: the orphan keeps showing up in the organizer's finance chart
 * (and the event vanishes from its real date) until someone runs RebuildAllStatsFunction.
 * ORG# is the one partition the nightly rebuild deliberately leaves alone, so nothing else
 * repairs this. See src/lambda/lib/statsRebuild.ts.
 *
 * A registration write can land on `from` between the read below and the transaction commit
 * (it applies a blind ADD to the same key). The delete is conditioned on the `updatedAt` we
 * just read so that race cancels the transaction instead of silently discarding the concurrent
 * increment; a bounded retry then re-reads the fresh item and moves that instead.
 *
 * The same blind ADD can also land on `to` (a registration saved after the event's new key was
 * already in effect), so the destination accumulates rather than overwrites.
 */
export async function moveOrganizerEventStats(
  existing: OrganizerStatsEvent,
  updated: OrganizerStatsEvent
): Promise<void> {
  const from = organizerStatsKey(existing)
  const to = organizerStatsKey(updated)
  if (from.PK === to.PK && from.SK === to.SK) return

  for (let attempt = 1; attempt <= MOVE_ORGANIZER_STATS_MAX_ATTEMPTS; attempt++) {
    // No record yet means no registrations have been counted for this event; the first
    // registration will simply create it under the new key.
    const stats = await dynamoDB.read<JsonEventStatsItem>(from, undefined, true)
    if (!stats) return

    try {
      // One transaction, because a half-finished move either double-counts the event in the
      // organizer's totals or drops it, and no scheduled job would notice either.
      await dynamoDB.documentTransaction([
        {
          // ADD, not Put: a registration for the *updated* event can already have created the
          // destination item (its blind ADD uses the new key). A Put would overwrite that
          // increment; accumulating into whatever is there merges the two instead.
          Update: {
            ExpressionAttributeNames: {
              '#cancelledRegistrations': 'cancelledRegistrations',
              '#count': 'count',
              '#date': 'date',
              '#organizerId': 'organizerId',
              '#paidAmount': 'paidAmount',
              '#paidRegistrations': 'paidRegistrations',
              '#refundedAmount': 'refundedAmount',
              '#refundedRegistrations': 'refundedRegistrations',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':cancelledRegistrations': stats.cancelledRegistrations ?? 0,
              ':count': stats.count ?? 0,
              ':date': updated.startDate,
              ':organizerId': updated.organizer.id,
              ':paidAmount': stats.paidAmount ?? 0,
              ':paidRegistrations': stats.paidRegistrations ?? 0,
              ':refundedAmount': stats.refundedAmount ?? 0,
              ':refundedRegistrations': stats.refundedRegistrations ?? 0,
              ':updatedAt': new Date().toISOString(),
            },
            Key: to,
            TableName: CONFIG.eventStatsTable,
            UpdateExpression:
              'ADD #cancelledRegistrations :cancelledRegistrations, #count :count, #paidAmount :paidAmount, #paidRegistrations :paidRegistrations, #refundedAmount :refundedAmount, #refundedRegistrations :refundedRegistrations SET #date = :date, #organizerId = :organizerId, #updatedAt = :updatedAt',
          },
        },
        {
          Delete: {
            ConditionExpression: stats.updatedAt
              ? '#updatedAt = :expectedUpdatedAt'
              : 'attribute_not_exists(#updatedAt)',
            ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
            ExpressionAttributeValues: stats.updatedAt ? { ':expectedUpdatedAt': stats.updatedAt } : undefined,
            Key: from,
            TableName: CONFIG.eventStatsTable,
          },
        },
      ])
      return
    } catch (error) {
      if (!isTransactionCancelled(error) || attempt === MOVE_ORGANIZER_STATS_MAX_ATTEMPTS) throw error
      await waitForStatsRetry(attempt)
    }
  }
}

/**
 * Helper for bucket calculation
 */
export function bucketForCount(count: number | undefined): string | undefined {
  if (count === undefined) return undefined
  if (count > 0 && count < 5) return `${count}`
  if (count >= 5 && count <= 9) return '5-9'
  if (count >= 10) return '10+'
  return undefined
}

/**
 * Hash an value for privacy in statistics
 * Uses SHA-256 to create a one-way hash of the value,
 * taking only 12 bytes of the digest and encoding as base64
 * for a shorter representation while maintaining uniqueness
 */
export function hashStatValue(value: string | undefined = ''): string {
  const fullDigest = crypto.createHash('sha256').update(value.toLowerCase().trim()).digest()

  // Use first 12 bytes of the digest, convert to base64 and remove padding characters
  return fullDigest.subarray(0, 12).toString('base64').split('=')[0]
}

export const participationIdentifiers = (registration: RegistrationStatsInput): Record<YearlyStatTypes, string> => {
  const hashedHandlerEmail = hashStatValue(registration.handler?.email)
  const hashedOwnerEmail = hashStatValue(registration.owner?.email)
  const hashedRegNo = hashStatValue(registration.dog?.regNo)

  return {
    breed: registration.dog?.breedCode ?? 'unknown',
    class: getRegistrationClass(registration),
    dog: hashedRegNo,
    'dog#handler': `${hashedRegNo}#${hashedHandlerEmail}`,
    event: registration.eventId,
    eventType: registration.eventType,
    handler: hashedHandlerEmail,
    owner: hashedOwnerEmail,
  }
}

const organizerStatsTransactionItem = (
  event: JsonConfirmedEvent,
  deltas: ReturnType<typeof calculateStatDeltas>,
  updatedAt: string
): StatsTransactionItem => ({
  Update: {
    ExpressionAttributeNames: {
      '#cancelledRegistrations': 'cancelledRegistrations',
      '#count': 'count',
      '#date': 'date',
      '#organizerId': 'organizerId',
      '#paidAmount': 'paidAmount',
      '#paidRegistrations': 'paidRegistrations',
      '#refundedAmount': 'refundedAmount',
      '#refundedRegistrations': 'refundedRegistrations',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':cancelledDelta': deltas.cancelledDelta,
      ':date': event.startDate,
      ':organizerId': event.organizer.id,
      ':paidAmountDelta': deltas.paidAmountDelta,
      ':paidDelta': deltas.paidDelta,
      ':refundedAmountDelta': deltas.refundedAmountDelta,
      ':refundedDelta': deltas.refundedDelta,
      ':totalDelta': deltas.totalDelta,
      ':updatedAt': updatedAt,
    },
    Key: organizerStatsKey(event),
    TableName: CONFIG.eventStatsTable,
    UpdateExpression:
      'ADD #cancelledRegistrations :cancelledDelta, #count :totalDelta, #paidAmount :paidAmountDelta, #paidRegistrations :paidDelta, #refundedAmount :refundedAmountDelta, #refundedRegistrations :refundedDelta SET #date = :date, #organizerId = :organizerId, #updatedAt = :updatedAt',
  },
})

/**
 * Applies a new registration's organizer stats and its completion marker in one transaction.
 *
 * Participation stats (unique dogs/handlers/breeds) used to be applied here too, which needed
 * a read-then-write snapshot pass; they are now recomputed wholesale by RebuildStatsFunction,
 * leaving only the shared ORG# ADD and the registration's own completion marker. The ORG# item
 * has no condition of its own, so a burst of registrations for the same event still cancels
 * each other's transactions with a TransactionConflict — that contention is retried below.
 * Only a genuine failure of *our own* condition (stats already applied, or the lease moved on
 * to another attempt) is treated as terminal.
 */
export const applyNewRegistrationStatsOnce = async (
  registration: JsonRegistration,
  event: JsonConfirmedEvent,
  leaseToken: string
): Promise<void> => {
  const deltas = calculateStatDeltas(registration, undefined)
  // Not used for the write itself, but an unparseable start date means the rebuild would skip
  // this event entirely, so fail loudly here rather than recording stats nothing can reconcile.
  if (eventStatsYear(event) === undefined) {
    throw new Error(`Cannot derive stats year from event start date: ${event.startDate}`)
  }

  for (let attempt = 1; attempt <= NEW_REGISTRATION_STATS_MAX_ATTEMPTS; attempt++) {
    const updatedAt = new Date().toISOString()
    const transaction: StatsTransactionItem[] = [
      organizerStatsTransactionItem(event, deltas, updatedAt),
      {
        Update: {
          ConditionExpression:
            'attribute_exists(#id) AND attribute_not_exists(#statsAt) AND #lease.#token = :leaseToken',
          ExpressionAttributeNames: {
            '#id': 'id',
            '#lease': 'newRegistrationLease',
            '#statsAt': 'newRegistrationStatsAt',
            '#token': 'token',
          },
          ExpressionAttributeValues: { ':leaseToken': leaseToken, ':statsAt': updatedAt },
          Key: { eventId: registration.eventId, id: registration.id },
          TableName: CONFIG.registrationTable,
          UpdateExpression: 'SET #statsAt = :statsAt',
        },
      },
    ]

    try {
      await dynamoDB.documentTransaction(transaction)
      return
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error

      const saved = await dynamoDB.read<JsonRegistration>(
        { eventId: registration.eventId, id: registration.id },
        CONFIG.registrationTable,
        true
      )
      if (saved?.newRegistrationStatsAt) return
      if (saved?.newRegistrationLease?.token !== leaseToken || attempt === NEW_REGISTRATION_STATS_MAX_ATTEMPTS) {
        throw error
      }

      // The organizer ADD has no condition of its own; the lease is still ours and the
      // completion marker isn't set, so this cancellation was contention on the shared ORG#
      // item, not a real failure. Full-jitter exponential backoff avoids every cancelled
      // transaction immediately colliding again.
      await waitForStatsRetry(attempt)
    }
  }
}

/**
 * Updates organizer event stats in DynamoDB after a registration change.
 * @param {JsonRegistration} registration - The new/updated registration
 * @param {JsonRegistration | undefined} existingRegistration - The previous registration, if any
 * @param {JsonConfirmedEvent} event - The event object
 */
export const updateEventStatsForRegistration = async (
  registration: RegistrationStatsInput,
  existingRegistration: RegistrationStatsInput | undefined,
  event: JsonConfirmedEvent
): Promise<void> => {
  // Validate before any mutation so a retry cannot double-count organizer stats.
  if (eventStatsYear(event) === undefined) {
    throw new Error(`Cannot derive stats year from event start date: ${event.startDate}`)
  }

  // Organizer stats are the only partition maintained here; participation, capacity and the
  // YEARS markers are recomputed nightly by RebuildStatsFunction.
  const deltas = calculateStatDeltas(registration, existingRegistration)
  await updateOrganizerEventStats(event, deltas)
}
