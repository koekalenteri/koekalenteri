import type {
  BreedStartRateEntry,
  CapacityStatsEntry,
  EventBreakdownEntry,
  JsonEventStatsItem,
  JudgeWorkloadEntry,
  RegistrationStatsInput,
  RetentionStats,
  YearlyBreakdownType,
  YearlyStatTypes,
  YearlyTotalStat,
} from '../../../types/Stats'
import crypto from 'node:crypto'
import { storedYear } from '../../../lib/event'
import {
  readAllOrganizerEventStats,
  readBreedStarts,
  readBuckets,
  readCapacityStats,
  readEventBreakdown,
  readJudgeWorkload,
  readOrganizerEventStats,
  readRetention,
  readStatsYears,
  readYearlyBreakdown,
  readYearlyTotals,
} from '../repositories/eventStatsRepository'
import { readEventTypes } from '../repositories/eventTypeRepository'

/** The Finnish year of an event's stored start date, or undefined for one without a calendar day. */
export function eventStatsYear({ startDate }: { startDate: string }): number | undefined {
  return storedYear(startDate)
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
    // Query for specific organizers, all at once; the result is sorted below anyway
    const perOrganizer = await Promise.all(
      organizerIds.map((organizerId) => readOrganizerEventStats(organizerId, from, to))
    )
    allStats = perOrganizer.flat()
  } else {
    // Query for all organizers
    allStats = await readAllOrganizerEventStats(from, to)
  }

  // Sort by date
  allStats.sort((a, b) => a.date.localeCompare(b.date))
  return allStats
}

/**
 * Get yearly total stats for a specific year
 */
export async function getYearlyTotalStats(year: number): Promise<YearlyTotalStat[]> {
  const items = await readYearlyTotals(year)

  return items.map((item) => ({
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
  const items = await readRetention(year)
  if (!items.length) return undefined

  const countFor = (sk: string) => items.find((item) => item.SK === sk)?.count ?? 0
  return { new: countFor('new'), returning: countFor('returning'), year }
}

/**
 * Get the per-entity participation breakdown for a specific year and type
 */
export async function getYearlyBreakdown(
  year: number,
  type: YearlyBreakdownType
): Promise<{ entityId: string; count: number }[]> {
  const items = await readYearlyBreakdown(year, type)

  return items.map((item) => ({
    count: item.count,
    entityId: item.SK,
  }))
}

/**
 * Starters vs. reserve per breed for a year: what share of each breed's non-cancelled entries
 * actually got a starting position. Written by the nightly rebuild, alongside breedBreakdown.
 */
export async function getBreedStartBreakdown(year: number): Promise<BreedStartRateEntry[]> {
  const items = await readBreedStarts(year)

  return items.map((item) => ({
    entityId: item.SK,
    reserve: item.reserve ?? 0,
    starters: item.starters ?? 0,
  }))
}

/**
 * Get dog#handler buckets for a specific year
 */
export async function getDogHandlerBuckets(year: number): Promise<{ bucket: string; count: number }[]> {
  const items = await readBuckets(year, 'dog#handler')

  return items.map((item) => ({
    bucket: item.SK,
    count: item.count,
  }))
}

/**
 * Get dogs-per-handler buckets for a specific year: how many handlers ran 1 dog, 2 dogs, etc.
 */
export async function getDogsPerHandlerBuckets(year: number): Promise<{ bucket: string; count: number }[]> {
  const items = await readBuckets(year, 'dogsPerHandler')

  return items.map((item) => ({
    bucket: item.SK,
    count: item.count,
  }))
}

/**
 * Get available years for which we have statistics
 */
export async function getAvailableYears(): Promise<number[]> {
  const items = await readStatsYears()

  // Convert SK (year as string) to numbers and sort
  return items.map((item) => Number.parseInt(item.SK, 10)).sort((a, b) => a - b)
}

/**
 * Get monthly available-places-vs-actual-starters stats for one event type,
 * optionally bounded to a yyyy-mm month range.
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

  const items = await readCapacityStats(eventType, organizerIds, from, to)

  const entries = items.map((item) => {
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
  const eventTypes = await readEventTypes()
  const activeEventTypes = eventTypes.filter((eventType) => eventType.active).map((et) => et.eventType)

  const results = await Promise.all(
    activeEventTypes.map((eventType) => getCapacityStats(eventType, undefined, from, to))
  )
  return results.flat()
}

/**
 * Get per-judge event counts for a specific year: how many events each judge officiated
 * (`held`) and is booked for (`upcoming`). Written by the nightly rebuild from the events table
 * alone, independent of registrations.
 *
 * Stored as one row per organizer + judge, so `organizerIds` narrows which organizers' events
 * are counted the same way it does for capacity stats; undefined means every organizer. The
 * rows are always summed into one entry per judge -- an event has exactly one organizer, so a
 * judge who officiated for several clubs gets the sum, never a duplicate.
 */
export async function getJudgeWorkload(year: number, organizerIds?: string[]): Promise<JudgeWorkloadEntry[]> {
  // An explicit empty list means "no organizers the caller may see", not "all of them".
  if (organizerIds?.length === 0) return []

  const items = await readJudgeWorkload(year, organizerIds)

  const totalsByJudge = new Map<string, JudgeWorkloadEntry>()
  for (const item of items) {
    const total = totalsByJudge.get(item.judgeId)
    if (total) {
      total.held += item.held
      total.upcoming += item.upcoming
    } else {
      totalsByJudge.set(item.judgeId, {
        held: item.held,
        judgeId: item.judgeId,
        name: item.name,
        upcoming: item.upcoming,
      })
    }
  }
  return [...totalsByJudge.values()]
}

/**
 * Events organized, their starting places, starts and distinct participating handlers for a
 * year, one entry per club + event type, plus each club's cross-type subtotal and the nationwide
 * grand total (see `ALL_EVENT_TYPES_FOR_CAPACITY` / `ALL_ORGANIZERS_FOR_EVENTS`). Written by the
 * nightly rebuild.
 */
export async function getEventBreakdown(year: number): Promise<EventBreakdownEntry[]> {
  const items = await readEventBreakdown(year)

  return items.map((item) => ({
    cancelledRegistrations: item.cancelledRegistrations ?? 0,
    eventCount: item.eventCount ?? 0,
    eventType: item.eventType,
    handlerCount: item.handlerCount ?? 0,
    memberStarters: item.memberStarters ?? 0,
    organizerId: item.organizerId,
    places: item.places ?? 0,
    reserve: item.reserve ?? 0,
    starters: item.starters ?? 0,
  }))
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

/**
 * A registration field as a stats sort key. A blank value gets the same bucket as a missing one:
 * DynamoDB refuses an empty string in a key attribute, so a single stored row with '' in any of
 * these fields failed the whole rebuild.
 */
export const statIdentifier = (value: string | null | undefined): string => value?.trim() || 'unknown'

export const participationIdentifiers = (registration: RegistrationStatsInput): Record<YearlyStatTypes, string> => {
  const hashedHandlerEmail = hashStatValue(registration.handler?.email)
  const hashedRegNo = hashStatValue(registration.dog?.regNo)

  return {
    breed: statIdentifier(registration.dog?.breedCode),
    // A blank class falls back to the event type, same as getRegistrationClass does for a missing one.
    class: statIdentifier(registration.class || registration.eventType),
    dog: hashedRegNo,
    'dog#handler': `${hashedRegNo}#${hashedHandlerEmail}`,
    event: registration.eventId,
    eventType: statIdentifier(registration.eventType),
    handler: hashedHandlerEmail,
  }
}
