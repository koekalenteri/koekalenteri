import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { EventStatsItem, YearlyStatTypes, YearlyTotalStat } from '../../types/Stats'
import crypto from 'node:crypto'
import { getEventSeason, OFFICIAL_EVENT_TYPES } from '../../lib/event'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// Single global client for all DynamoDB operations
const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)
const NEW_REGISTRATION_STATS_MAX_ATTEMPTS = 12
const NEW_REGISTRATION_STATS_RETRY_BASE_MS = 10
const NEW_REGISTRATION_STATS_RETRY_MAX_MS = 500

type StatsTransactionItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number]

export type RegistrationStatsInput = Pick<
  JsonRegistration,
  'cancelled' | 'eventId' | 'eventType' | 'id' | 'paidAmount' | 'refundAmount'
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
  const items = await dynamoDB.readAll<Required<EventStatsItem>>({
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
    count: item.count,
    type: item.SK as YearlyStatTypes,
    year,
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
  return items.map((item) => Number.parseInt(item.SK, 10)).sort((a, b) => a - b)
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
  isDogHandler: boolean,
  delta = 1
): Promise<void> {
  if (!entityId || delta === 0) return

  // Step 1: Update the per-entity participation count and retrieve its previous value
  const pk = `STAT#${year}#${type}`
  const sk = entityId

  const updateResult = await dynamoDB.update(
    { PK: pk, SK: sk },
    {
      add: {
        count: delta,
      },
    },
    undefined,
    'UPDATED_OLD'
  )
  const oldCount = updateResult?.Attributes?.count
  const previousCount = oldCount ?? 0
  const newCount = previousCount + delta

  // Step 2: Update the unique-entity total when the count crosses zero
  let totalDelta = 0
  if (previousCount <= 0 && newCount > 0) totalDelta = 1
  else if (previousCount > 0 && newCount <= 0) totalDelta = -1
  if (totalDelta !== 0) {
    await dynamoDB.update(
      { PK: `TOTALS#${year}`, SK: type },
      {
        add: {
          count: totalDelta,
        },
      }
    )
  }

  // Step 3: Update bucket stats for dog#handler
  if (isDogHandler) {
    await updateBucketStats(year, oldCount, newCount)
  }
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
    dog: hashedRegNo,
    'dog#handler': `${hashedRegNo}#${hashedHandlerEmail}`,
    eventType: registration.eventType,
    handler: hashedHandlerEmail,
    owner: hashedOwnerEmail,
  }
}

type ParticipationSnapshot = {
  entityId: string
  isDogHandler: boolean
  newCount: number
  previousCount: number
  type: YearlyStatTypes
}

const readParticipationSnapshots = async (
  registration: RegistrationStatsInput,
  year: number
): Promise<ParticipationSnapshot[]> => {
  const identifiers = participationIdentifiers(registration)

  return Promise.all(
    (Object.keys(identifiers) as YearlyStatTypes[]).map(async (type) => {
      const entityId = identifiers[type]
      const current = await dynamoDB.read<{ count?: number }>(
        { PK: `STAT#${year}#${type}`, SK: entityId },
        undefined,
        true
      )
      const previousCount = current?.count ?? 0

      return {
        entityId,
        isDogHandler: type === 'dog#handler',
        newCount: previousCount + 1,
        previousCount,
        type,
      }
    })
  )
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
    Key: { PK: `ORG#${event.organizer.id}`, SK: `${event.startDate}#${event.id}` },
    TableName: CONFIG.eventStatsTable,
    UpdateExpression:
      'ADD #cancelledRegistrations :cancelledDelta, #count :totalDelta, #paidAmount :paidAmountDelta, #paidRegistrations :paidDelta, #refundedAmount :refundedAmountDelta, #refundedRegistrations :refundedDelta SET #date = :date, #organizerId = :organizerId, #updatedAt = :updatedAt',
  },
})

const participationCountItem = (snapshot: ParticipationSnapshot, year: number): StatsTransactionItem => {
  const countExists = snapshot.previousCount !== 0
  return {
    Update: {
      ConditionExpression: countExists ? '#count = :previousCount' : 'attribute_not_exists(#count) OR #count = :zero',
      ExpressionAttributeNames: { '#count': 'count' },
      ExpressionAttributeValues: {
        ':delta': 1,
        ...(countExists ? { ':previousCount': snapshot.previousCount } : { ':zero': 0 }),
      },
      Key: { PK: `STAT#${year}#${snapshot.type}`, SK: snapshot.entityId },
      TableName: CONFIG.eventStatsTable,
      UpdateExpression: 'ADD #count :delta',
    },
  }
}

const participationTotalItem = (snapshot: ParticipationSnapshot, year: number): StatsTransactionItem => ({
  Update: {
    ExpressionAttributeNames: { '#count': 'count' },
    ExpressionAttributeValues: { ':delta': 1 },
    Key: { PK: `TOTALS#${year}`, SK: snapshot.type },
    TableName: CONFIG.eventStatsTable,
    UpdateExpression: 'ADD #count :delta',
  },
})

const participationBucketItems = (snapshot: ParticipationSnapshot, year: number): StatsTransactionItem[] => {
  if (!snapshot.isDogHandler) return []
  const oldBucket = bucketForCount(snapshot.previousCount)
  const newBucket = bucketForCount(snapshot.newCount)
  if (oldBucket === newBucket) return []

  return (
    [
      [oldBucket, -1],
      [newBucket, 1],
    ] as const
  ).flatMap(([bucket, delta]) =>
    bucket
      ? [
          {
            Update: {
              ExpressionAttributeNames: { '#count': 'count' },
              ExpressionAttributeValues: { ':delta': delta },
              Key: { PK: `BUCKETS#${year}#dog#handler`, SK: bucket },
              TableName: CONFIG.eventStatsTable,
              UpdateExpression: 'ADD #count :delta',
            },
          },
        ]
      : []
  )
}

const participationStatsTransactionItems = (
  snapshots: ParticipationSnapshot[],
  year: number
): StatsTransactionItem[] => {
  const items: StatsTransactionItem[] = []

  for (const snapshot of snapshots) {
    items.push(participationCountItem(snapshot, year))

    if (snapshot.previousCount <= 0 && snapshot.newCount > 0) {
      items.push(participationTotalItem(snapshot, year))
    }
    items.push(...participationBucketItems(snapshot, year))
  }

  return items
}

const isTransactionCancelled = (error: unknown) => (error as { name?: string }).name === 'TransactionCanceledException'

const waitForStatsRetry = (attempt: number) => {
  const maximumDelay = Math.min(
    NEW_REGISTRATION_STATS_RETRY_BASE_MS * 2 ** (attempt - 1),
    NEW_REGISTRATION_STATS_RETRY_MAX_MS
  )
  const delay = Math.floor(Math.random() * maximumDelay)
  return new Promise<void>((resolve) => setTimeout(resolve, delay))
}

/**
 * Applies every initial registration statistic and its completion marker in a
 * single transaction. Optimistic entity-count conditions keep unique totals
 * and dog-handler buckets correct when registrations are created concurrently.
 */
export const applyNewRegistrationStatsOnce = async (
  registration: JsonRegistration,
  event: JsonConfirmedEvent,
  leaseToken: string
): Promise<void> => {
  const deltas = calculateStatDeltas(registration, undefined)
  const year = eventStatsYear(event)
  if (year === undefined) throw new Error(`Cannot derive stats year from event start date: ${event.startDate}`)

  for (let attempt = 1; attempt <= NEW_REGISTRATION_STATS_MAX_ATTEMPTS; attempt++) {
    const snapshots = OFFICIAL_EVENT_TYPES.includes(event.eventType)
      ? await readParticipationSnapshots(registration, year)
      : []
    const updatedAt = new Date().toISOString()
    const transaction: StatsTransactionItem[] = [
      organizerStatsTransactionItem(event, deltas, updatedAt),
      {
        Update: {
          ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: { ':updatedAt': updatedAt },
          Key: { PK: 'YEARS', SK: year.toString() },
          TableName: CONFIG.eventStatsTable,
          UpdateExpression: 'SET #updatedAt = :updatedAt',
        },
      },
      ...participationStatsTransactionItems(snapshots, year),
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

      // Shared counters such as eventType and breed are expected to conflict
      // during registration bursts. Full-jitter exponential backoff prevents
      // every cancelled transaction from immediately colliding again.
      await waitForStatsRetry(attempt)
    }
  }
}

/**
 * Update yearly participation stats for official event types
 */
export async function updateYearlyParticipationStats(
  registration: RegistrationStatsInput,
  year: number,
  existingRegistration?: RegistrationStatsInput
): Promise<void> {
  const identifiers = participationIdentifiers(registration)
  const existingIdentifiers = existingRegistration ? participationIdentifiers(existingRegistration) : undefined

  for (const type of Object.keys(identifiers) as YearlyStatTypes[]) {
    const entityId = identifiers[type]
    const existingEntityId = existingIdentifiers?.[type]

    if (entityId === existingEntityId) continue

    if (existingEntityId) {
      await updateEntityStats(year, type, existingEntityId, type === 'dog#handler', -1)
    }
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
  registration: RegistrationStatsInput,
  existingRegistration: RegistrationStatsInput | undefined,
  event: JsonConfirmedEvent
): Promise<void> => {
  // Validate before any mutation so a retry cannot double-count organizer stats.
  const year = eventStatsYear(event)
  if (year === undefined) throw new Error(`Cannot derive stats year from event start date: ${event.startDate}`)

  // Step 1: Calculate deltas for statistics and update organizer event stats.
  const deltas = calculateStatDeltas(registration, existingRegistration)
  await updateOrganizerEventStats(event, deltas)

  // Step 2: Add year to a separate record for easy querying in the event timezone.
  await updateYearRecord(year)

  // Step 3: Update yearly participation stats (only for official event types)
  if (!OFFICIAL_EVENT_TYPES.includes(event.eventType)) {
    return
  }

  await updateYearlyParticipationStats(registration, year, existingRegistration)
}
