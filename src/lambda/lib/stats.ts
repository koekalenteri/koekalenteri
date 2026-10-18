import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
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
} from '../../types/Stats'
import type { OrganizerStatsEvent, StatDeltas } from './repositories/eventStatsRepository'
import crypto from 'node:crypto'
import { storedYear } from '../../lib/event'
import { isMember, isStarter } from '../../lib/registration'
import { isTransactionCanceled } from './api-gw'
import {
  addOrganizerEventStats,
  commitNewRegistrationStats,
  isSameOrganizerStatsRow,
  moveOrganizerEventStatsRow,
  readAllOrganizerEventStats,
  readBreedStarts,
  readBuckets,
  readCapacityStats,
  readEventBreakdown,
  readJudgeWorkload,
  readOrganizerEventStats,
  readOrganizerEventStatsRow,
  readRetention,
  readStatsYears,
  readYearlyBreakdown,
  readYearlyTotals,
} from './repositories/eventStatsRepository'
import { readEventTypes } from './repositories/eventTypeRepository'
import { readRegistrationConsistently } from './repositories/registrationRepository'

const NEW_REGISTRATION_STATS_MAX_ATTEMPTS = 12
const NEW_REGISTRATION_STATS_RETRY_BASE_MS = 10
const NEW_REGISTRATION_STATS_RETRY_MAX_MS = 500
const MOVE_ORGANIZER_STATS_MAX_ATTEMPTS = 8

const waitForStatsRetry = (attempt: number) => {
  const maximumDelay = Math.min(
    NEW_REGISTRATION_STATS_RETRY_BASE_MS * 2 ** (attempt - 1),
    NEW_REGISTRATION_STATS_RETRY_MAX_MS
  )
  const delay = Math.floor(Math.random() * maximumDelay)
  return new Promise<void>((resolve) => setTimeout(resolve, delay))
}

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
 * Get per-judge event counts for a specific year: how many events each judge officiated.
 * Written by the nightly rebuild from the events table alone, independent of registrations.
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
      total.count += item.count
    } else {
      totalsByJudge.set(item.judgeId, { count: item.count, judgeId: item.judgeId, name: item.name })
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

/** On the waiting list: not cancelled, and not placed in a participant (starting) group. */
const isReserve = (registration: RegistrationStatsInput): boolean => !registration.cancelled && !isStarter(registration)

/** A starter (non-cancelled, non-reserve) whose owner or handler is a club member. */
const isMemberStarter = (registration: RegistrationStatsInput): boolean =>
  isStarter(registration) && isMember(registration)

/**
 * Calculate the deltas for various statistics based on registration changes
 */
export function calculateStatDeltas(
  registration: RegistrationStatsInput,
  existingRegistration: RegistrationStatsInput | undefined
): StatDeltas {
  return {
    cancelledDelta: (registration.cancelled ? 1 : 0) - (existingRegistration?.cancelled ? 1 : 0),
    memberDelta:
      (isMemberStarter(registration) ? 1 : 0) -
      (existingRegistration ? Number(isMemberStarter(existingRegistration)) : 0),
    paidAmountDelta: (registration.paidAmount ?? 0) - (existingRegistration?.paidAmount ?? 0),
    paidDelta: (registration.paidAmount ? 1 : 0) - (existingRegistration?.paidAmount ? 1 : 0),
    refundedAmountDelta: (registration.refundAmount ?? 0) - (existingRegistration?.refundAmount ?? 0),
    refundedDelta: (registration.refundAmount ? 1 : 0) - (existingRegistration?.refundAmount ? 1 : 0),
    reserveDelta:
      (isReserve(registration) ? 1 : 0) - (existingRegistration ? Number(isReserve(existingRegistration)) : 0),
    totalDelta: existingRegistration ? 0 : 1,
  }
}

/** The deltas of registrations that are all new to the event, added up: an event copied in whole (KOE-1471). */
export function sumNewRegistrationStatDeltas(registrations: RegistrationStatsInput[]): StatDeltas {
  const deltas = registrations.map((registration) => calculateStatDeltas(registration, undefined))
  const sum = (pick: (delta: StatDeltas) => number) => deltas.reduce((total, delta) => total + pick(delta), 0)
  return {
    cancelledDelta: sum((delta) => delta.cancelledDelta),
    memberDelta: sum((delta) => delta.memberDelta),
    paidAmountDelta: sum((delta) => delta.paidAmountDelta),
    paidDelta: sum((delta) => delta.paidDelta),
    refundedAmountDelta: sum((delta) => delta.refundedAmountDelta),
    refundedDelta: sum((delta) => delta.refundedDelta),
    reserveDelta: sum((delta) => delta.reserveDelta),
    totalDelta: sum((delta) => delta.totalDelta),
  }
}

/**
 * Update the organizer event stats in DynamoDB
 */
export async function updateOrganizerEventStats(event: OrganizerStatsEvent, deltas: StatDeltas): Promise<void> {
  await addOrganizerEventStats(event, deltas, new Date().toISOString())
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
  if (isSameOrganizerStatsRow(existing, updated)) return

  for (let attempt = 1; attempt <= MOVE_ORGANIZER_STATS_MAX_ATTEMPTS; attempt++) {
    // No record yet means no registrations have been counted for this event; the first
    // registration will simply create it under the new key.
    const stats = await readOrganizerEventStatsRow(existing)
    if (!stats) return

    try {
      // One transaction, because a half-finished move either double-counts the event in the
      // organizer's totals or drops it, and no scheduled job would notice either.
      await moveOrganizerEventStatsRow(existing, updated, stats, new Date().toISOString())
      return
    } catch (error) {
      if (!isTransactionCanceled(error) || attempt === MOVE_ORGANIZER_STATS_MAX_ATTEMPTS) throw error
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

/**
 * A registration field as a stats sort key. A blank value gets the same bucket as a missing one:
 * DynamoDB refuses an empty string in a key attribute, so a single stored row with '' in any of
 * these fields failed the whole rebuild (RebuildAllStats and the nightly run alike).
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
    try {
      await commitNewRegistrationStats(event, deltas, registration, leaseToken, new Date().toISOString())
      return
    } catch (error) {
      if (!isTransactionCanceled(error)) throw error

      const saved = await readRegistrationConsistently(registration.eventId, registration.id)
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
