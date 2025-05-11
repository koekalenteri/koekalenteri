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
export async function getOrganizerStats(
  organizerIds?: string[],
  from?: string,
  to?: string
): Promise<EventStatsItem[]> {
  let allStats: EventStatsItem[] = []

  // If organizerIds is provided, query for each organizerId
  if (organizerIds && organizerIds.length > 0) {
    for (const organizerId of organizerIds) {
      // Build filter expression for date range filtering
      const filterExpressions: string[] = []
      const keyCondition = '#pk = :pk'
      const expressionNames: Record<string, string> = { '#pk': 'PK' }
      const expressionValues: Record<string, any> = { ':pk': `ORG#${organizerId}` }

      if (from) {
        filterExpressions.push('SK >= :from')
        expressionValues[':from'] = from
      }

      if (to) {
        filterExpressions.push('SK <= :to')
        expressionValues[':to'] = to
      }

      // Combine filter expressions if any
      const filterExpression = filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined

      // Query for this organizerId with date filters using the new PK/SK pattern
      // PK: ORG#<organizerId>
      // SK: <startDate>#<eventId>

      const items = await dynamoDB.query<EventStatsItem>(
        keyCondition,
        expressionValues,
        undefined,
        undefined,
        expressionNames,
        undefined,
        undefined,
        filterExpression
      )

      if (items) {
        allStats = [...allStats, ...items]
      }
    }
  } else {
    // For admin users, we need to get all stats
    // Use readAll with filtering capabilities
    const filterExpressions: string[] = ['begins_with(#pk, :orgPrefix)']
    const expressionNames: Record<string, string> = { '#pk': 'PK' }
    const expressionValues: Record<string, any> = { ':orgPrefix': 'ORG#' }

    // Apply date range filters if provided
    if (from) {
      filterExpressions.push('SK >= :from')
      expressionValues[':from'] = from
    }

    if (to) {
      filterExpressions.push('SK <= :to')
      expressionValues[':to'] = to
    }

    // Combine filter expressions
    const filterExpression = filterExpressions.join(' AND ')

    // Use the new filtering capabilities of readAll
    const filteredItems = await dynamoDB.readAll<EventStatsItem>(
      undefined,
      filterExpression,
      expressionValues,
      expressionNames
    )

    if (filteredItems && filteredItems.length > 0) {
      allStats = filteredItems
    }
  }

  return allStats
}

/**
 * Get yearly total stats for a specific year
 */
export async function getYearlyTotalStats(year: number): Promise<YearlyTotalStat[]> {
  const pk = `TOTALS#${year}`
  const items = await dynamoDB.query<{ SK: string; count: number }>('PK = :pk', { ':pk': pk })

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
  const items = await dynamoDB.query<{ SK: string; count: number }>('PK = :pk', { ':pk': pk })

  return (items || []).map((item) => ({
    bucket: item.SK,
    count: item.count,
  }))
}

/**
 * Get available years for which we have statistics
 */
export async function getAvailableYears(): Promise<number[]> {
  const items = await dynamoDB.query<{ SK: string }>('PK = :pk', { ':pk': 'YEARS' })

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
 * Hash an email address for privacy in statistics
 * Uses SHA-256 to create a one-way hash of the email,
 * taking only 12 bytes of the digest and encoding as base64
 * for a shorter representation while maintaining uniqueness
 */
export function hashEmail(email: string): string {
  const fullDigest = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest()

  // Use first 12 bytes of the digest, convert to base64 and remove padding characters
  return fullDigest.subarray(0, 12).toString('base64').replace(/=+$/, '')
}

/**
 * Update yearly participation stats for official event types
 */
export async function updateYearlyParticipationStats(registration: JsonRegistration, year: number): Promise<void> {
  // Hash email addresses for privacy
  const hashedHandlerEmail = hashEmail(registration.handler.email)
  const hashedOwnerEmail = hashEmail(registration.owner.email)

  const identifiers: Record<YearlyStatTypes, string> = {
    eventType: registration.eventType,
    dog: registration.dog.regNo,
    breed: registration.dog.breedCode ?? 'unknown',
    handler: hashedHandlerEmail,
    owner: hashedOwnerEmail,
    'dog#handler': `${registration.dog.regNo}#${hashedHandlerEmail}`,
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
