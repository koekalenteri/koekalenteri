import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { EventStatsItem, YearlyStatTypes, YearlyTotalStat } from '../../types/Stats'

import crypto from 'crypto'

import { OFFICIAL_EVENT_TYPES } from '../../lib/event'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// Single global client for all DynamoDB operations
const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)

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

  return { filterExpressions, expressionValues }
}

/**
 * Query stats for a single organizer with optional date filtering
 */
async function queryOrganizerStats(
  organizerId: string,
  from?: string,
  to?: string
): Promise<Required<EventStatsItem>[]> {
  const keyCondition = '#pk = :pk'
  const expressionNames: Record<string, string> = { '#pk': 'PK' }
  const expressionValues: Record<string, any> = { ':pk': `ORG#${organizerId}` }

  // Add date range filters
  const { filterExpressions, expressionValues: dateValues } = buildDateRangeFilters(from, to)
  Object.assign(expressionValues, dateValues)

  // Combine filter expressions if any
  const filterExpression = filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined

  // Query for this organizerId with date filters
  const items = await dynamoDB.query<Required<EventStatsItem>>({
    key: keyCondition,
    values: expressionValues,
    names: expressionNames,
    filterExpression,
  })

  return items || []
}

/**
 * Query stats for all organizers with optional date filtering
 */
async function queryAllOrganizerStats(from?: string, to?: string): Promise<Required<EventStatsItem>[]> {
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
  const items = await dynamoDB.readAll<Required<EventStatsItem>>(
    undefined,
    filterExpression,
    expressionValues,
    expressionNames
  )

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
): Promise<EventStatsItem[]> {
  let allStats: Required<EventStatsItem>[] = []

  if (organizerIds?.length) {
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
    year,
    type: item.SK as YearlyStatTypes,
    count: item.count,
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
  return items.map((item) => parseInt(item.SK, 10)).sort((a, b) => a - b)
}

/**
 * Calculate the deltas for various statistics based on registration changes
 */
export function calculateStatDeltas(
  registration: JsonRegistration,
  existingRegistration: JsonRegistration | undefined
) {
  return {
    totalDelta: existingRegistration ? 0 : 1,
    paidDelta: (registration.paidAmount ? 1 : 0) - (existingRegistration?.paidAmount ? 1 : 0),
    cancelledDelta: (registration.cancelled ? 1 : 0) - (existingRegistration?.cancelled ? 1 : 0),
    refundedDelta: (registration.refundAmount ? 1 : 0) - (existingRegistration?.refundAmount ? 1 : 0),
    paidAmountDelta: (registration.paidAmount ?? 0) - (existingRegistration?.paidAmount ?? 0),
    refundedAmountDelta: (registration.refundAmount ?? 0) - (existingRegistration?.refundAmount ?? 0),
  }
}

/**
 * Update the organizer event stats in DynamoDB
 */
export async function updateOrganizerEventStats(
  event: JsonConfirmedEvent,
  deltas: ReturnType<typeof calculateStatDeltas>
): Promise<void> {
  const key = {
    PK: `ORG#${event.organizer.id}`,
    SK: `${event.startDate}#${event.id}`,
  }

  await dynamoDB.update(key, {
    set: {
      organizerId: event.organizer.id,
      date: event.startDate,
      updatedAt: new Date().toISOString(),
    },
    add: {
      count: deltas.totalDelta,
      paidRegistrations: deltas.paidDelta,
      cancelledRegistrations: deltas.cancelledDelta,
      refundedRegistrations: deltas.refundedDelta,
      paidAmount: deltas.paidAmountDelta,
      refundedAmount: deltas.refundedAmountDelta,
    },
  })
}

/**
 * Add the year to a separate record for easy querying of available years
 */
export async function updateYearRecord(year: number): Promise<void> {
  await dynamoDB.update(
    { PK: 'YEARS', SK: year.toString() },
    {
      set: {
        updatedAt: new Date().toISOString(),
      },
    }
  )
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
 * Update bucket stats for dog#handler
 */
export async function updateBucketStats(year: number, oldCount: number | undefined, newCount: number): Promise<void> {
  const prevCount = oldCount ?? 0
  const oldBucket = bucketForCount(prevCount)
  const newBucket = bucketForCount(newCount)

  if (oldBucket !== newBucket) {
    if (oldBucket) {
      await dynamoDB.update(
        { PK: `BUCKETS#${year}#dog#handler`, SK: oldBucket },
        {
          add: {
            count: -1,
          },
        }
      )
    }
    if (newBucket) {
      await dynamoDB.update(
        { PK: `BUCKETS#${year}#dog#handler`, SK: newBucket },
        {
          add: {
            count: 1,
          },
        }
      )
    }
  }
}

/**
 * Update yearly participation stats for a specific entity type
 */
export async function updateEntityStats(
  year: number,
  type: string,
  entityId: string,
  isDogHandler: boolean
): Promise<void> {
  if (!entityId) return

  // Step 1: Add per-entity row if not exists (ADD count :incr, ReturnValues: "UPDATED_OLD")
  const pk = `STAT#${year}#${type}`
  const sk = entityId
  let oldCount: number | undefined = undefined

  const updateResult = await dynamoDB.update(
    { PK: pk, SK: sk },
    {
      add: {
        count: 1,
      },
    },
    undefined,
    'UPDATED_OLD'
  )
  // DynamoDB returns Attributes if the item existed
  oldCount = updateResult?.Attributes?.count

  // Step 2: If first occurrence, increment corresponding total
  if (oldCount === undefined) {
    await dynamoDB.update(
      { PK: `TOTALS#${year}`, SK: type },
      {
        add: {
          count: 1,
        },
      }
    )
  }

  // Step 3: Update bucket stats for dog#handler
  if (isDogHandler) {
    const newCount = (oldCount ?? 0) + 1
    await updateBucketStats(year, oldCount, newCount)
  }
}

/**
 * Hash an value for privacy in statistics
 * Uses SHA-256 to create a one-way hash of the value,
 * taking only 12 bytes of the digest and encoding as base64
 * for a shorter representation while maintaining uniqueness
 */
export function hashStatValue(value: string): string {
  const fullDigest = crypto.createHash('sha256').update(value.toLowerCase().trim()).digest()

  // Use first 12 bytes of the digest, convert to base64 and remove padding characters
  return fullDigest.subarray(0, 12).toString('base64').split('=')[0]
}

/**
 * Update yearly participation stats for official event types
 */
export async function updateYearlyParticipationStats(registration: JsonRegistration, year: number): Promise<void> {
  // Hash email addresses for privacy
  const hashedHandlerEmail = hashStatValue(registration.handler.email)
  const hashedOwnerEmail = hashStatValue(registration.owner.email)
  const hashedRegNo = hashStatValue(registration.dog.regNo)

  const identifiers: Record<YearlyStatTypes, string> = {
    eventType: registration.eventType,
    dog: hashedRegNo,
    breed: registration.dog.breedCode ?? 'unknown',
    handler: hashedHandlerEmail,
    owner: hashedOwnerEmail,
    'dog#handler': `${hashedRegNo}#${hashedHandlerEmail}`,
  }

  for (const [type, entityId] of Object.entries(identifiers)) {
    await updateEntityStats(year, type, entityId, type === 'dog#handler')
  }
}

/**
 * Updates organizer event stats in DynamoDB after a registration change.
 * @param {JsonRegistration} registration - The new/updated registration
 * @param {JsonRegistration | undefined} existingRegistration - The previous registration, if any
 * @param {JsonConfirmedEvent} event - The event object
 */
export const updateEventStatsForRegistration = async (
  registration: JsonRegistration,
  existingRegistration: JsonRegistration | undefined,
  event: JsonConfirmedEvent
): Promise<void> => {
  // Step 1: Calculate deltas for statistics
  const deltas = calculateStatDeltas(registration, existingRegistration)

  // Step 2: Update organizer event stats
  await updateOrganizerEventStats(event, deltas)

  // Step 3: Add year to a separate record for easy querying
  const year = new Date(event.startDate).getUTCFullYear()
  await updateYearRecord(year)

  // Step 4: Update yearly participation stats (only for official event types)
  if (!OFFICIAL_EVENT_TYPES.includes(event.eventType)) {
    return
  }

  await updateYearlyParticipationStats(registration, year)
}
