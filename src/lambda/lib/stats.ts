import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { EventStatsItem, YearlyStatTypes, YearlyTotalStat } from '../../types/Stats'

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
      const keyCondition = 'PK = :pk'

      const items = await dynamoDB.query<EventStatsItem>(
        keyCondition,
        expressionValues,
        undefined,
        undefined,
        undefined,
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
    const filterExpressions: string[] = ['begins_with(PK, :orgPrefix)']
    const expressionValues: Record<string, any> = { ':orgPrefix': 'ORG#' }
    const expressionNames: Record<string, string> = {}

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
  const totalDelta = existingRegistration ? 0 : 1
  const paidDelta = (registration.paidAmount ? 1 : 0) - (existingRegistration?.paidAmount ? 1 : 0)
  const cancelledDelta = (registration.cancelled ? 1 : 0) - (existingRegistration?.cancelled ? 1 : 0)
  const refundedDelta = (registration.refundAmount ? 1 : 0) - (existingRegistration?.refundAmount ? 1 : 0)
  const paidAmountDelta = (registration.paidAmount ?? 0) - (existingRegistration?.paidAmount ?? 0)
  const refundedAmountDelta = (registration.refundAmount ?? 0) - (existingRegistration?.refundAmount ?? 0)

  // Use the new PK/SK pattern for organizer event stats
  // PK: ORG#<organizerId>
  // SK: <startDate>#<eventId>
  const key = {
    PK: `ORG#${event.organizer.id}`,
    SK: `${event.startDate}#${event.id}`,
  }

  // Include the original fields for backward compatibility
  const expression = [
    'SET organizerId = :organizerId',
    'eventId = :eventId',
    'eventStartDate = :eventStartDate',
    'eventEndDate = :eventEndDate',
    'updatedAt = :updatedAt',
    'ADD count :totalDelta',
    'paidRegistrations :paidDelta',
    'cancelledRegistrations :cancelledDelta',
    'refundedRegistrations :refundedDelta',
    'paidAmount :paidAmountDelta',
    'refundedAmount :refundedAmountDelta',
  ].join(' ')

  const names = {}
  const values = {
    ':organizerId': event.organizer.id,
    ':eventId': event.id,
    ':eventStartDate': event.startDate,
    ':eventEndDate': event.endDate,
    ':updatedAt': new Date().toISOString(),
    ':totalDelta': totalDelta,
    ':paidDelta': paidDelta,
    ':cancelledDelta': cancelledDelta,
    ':refundedDelta': refundedDelta,
    ':paidAmountDelta': paidAmountDelta,
    ':refundedAmountDelta': refundedAmountDelta,
  }

  await dynamoDB.update(key, expression, names, values)

  // Add year to a separate record for easy querying of available years
  // Extract year from event start date
  const year = new Date(event.startDate).getUTCFullYear()

  // Create a record with PK: YEARS and SK: <year>
  await dynamoDB.update(
    { PK: 'YEARS', SK: year.toString() },
    'SET updatedAt = :updatedAt',
    {},
    { ':updatedAt': new Date().toISOString() }
  )

  // --- Yearly Participation Stats ---
  // Only for official event types
  if (!OFFICIAL_EVENT_TYPES.includes(event.eventType)) {
    return
  }

  const identifiers: Record<YearlyStatTypes, string> = {
    handler: registration.handler.email,
    dog: registration.dog.regNo,
    breed: registration.dog.breedCode ?? 'unknown',
    owner: registration.owner.email,
    'dog#handler': `${registration.dog.regNo}#${registration.handler.email}`,
  }

  // Helper for bucket calculation
  function bucketForCount(count: number | undefined): string | undefined {
    if (count === undefined) return undefined
    if (count < 5) return `${count}`
    if (count >= 5 && count <= 9) return '5-9'
    if (count >= 10) return '10+'
    return undefined
  }

  for (const [type, entityId] of Object.entries(identifiers)) {
    if (!entityId) continue

    // Step 1: Add per-entity row if not exists (ADD count :incr, ReturnValues: "UPDATED_OLD")
    const pk = `STAT#${year}#${type}`
    const sk = entityId
    let oldCount: number | undefined = undefined

    const updateResult = await dynamoDB.update(
      { PK: pk, SK: sk },
      'ADD #count :incr',
      { '#count': 'count' },
      { ':incr': 1 },
      undefined,
      'UPDATED_OLD'
    )
    // DynamoDB returns Attributes if the item existed
    oldCount = updateResult?.Attributes?.count

    // Step 2: If first occurrence, increment corresponding total
    if (oldCount === undefined) {
      await dynamoDB.update(
        { PK: `TOTALS#${year}`, SK: type },
        'ADD #count :incr',
        { '#count': 'count' },
        { ':incr': 1 }
      )
    }

    // Step 3: Update bucket stats for dog#handler
    if (type === 'dog#handler') {
      const prevCount = oldCount ?? 0
      const newCount = prevCount + 1
      const oldBucket = bucketForCount(prevCount)
      const newBucket = bucketForCount(newCount)
      if (oldBucket !== newBucket) {
        if (oldBucket) {
          await dynamoDB.update(
            { PK: `BUCKETS#${year}#dog#handler`, SK: oldBucket },
            'ADD #count :decr',
            { '#count': 'count' },
            { ':decr': -1 }
          )
        }
        if (newBucket) {
          await dynamoDB.update(
            { PK: `BUCKETS#${year}#dog#handler`, SK: newBucket },
            'ADD #count :incr',
            { '#count': 'count' },
            { ':incr': 1 }
          )
        }
      }
    }
  }
}
