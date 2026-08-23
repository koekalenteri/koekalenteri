import type { ReplaceOptional } from './utility'

interface OrganizerEventStats {
  organizerId: string
  eventId: string
  date: string
  count: number // total registrations
  reserveRegistrations: number
  cancelledRegistrations: number
  paidRegistrations: number
  refundedRegistrations: number
  paidAmount: number
  refundedAmount: number
  updatedAt: string
}

export type YearlyStatTypes = 'eventType' | 'dog' | 'breed' | 'handler' | 'owner' | 'dog#handler' | 'class' | 'event'

export interface YearlyTotalStat {
  year: number
  type: YearlyStatTypes
  count: number
}

/**
 * Dog+handler pairs of a year split by whether they also competed the year before. Absent for
 * the earliest year on record, where "new" would only mean "this is where the data begins".
 */
export interface RetentionStats {
  year: number
  new: number
  returning: number
}

export interface YearlyBreakdownEntry {
  entityId: string
  count: number
}

// DynamoDB item / wire shape for the unified table (dates as ISO strings)
export interface JsonEventStatsItem extends Partial<OrganizerEventStats> {
  PK: string
  SK: string
  count?: number
}

// Frontend domain shape: http.get revives date-only strings into Date objects
export type EventStatsItem = ReplaceOptional<JsonEventStatsItem, 'date', Date>

/**
 * Sentinel `eventType` value for the public capacity endpoint: aggregates every active event
 * type server-side instead of one specific type. A single type's places are set by competition
 * rules, so its registrations-per-event figure mostly just reflects the rule rather than demand;
 * summing across types before computing a rate is what makes the rate meaningful.
 */
export const ALL_EVENT_TYPES_FOR_CAPACITY = 'ALL'

/**
 * Monthly available-places-vs-actual-starters aggregate for one event type + class,
 * used to gauge audience demand when planning future events.
 */
export interface CapacityStatsEntry {
  month: string // yyyy-mm
  eventType: string
  class: string // RegistrationClass, or eventType for classless event types
  organizerId: string
  places: number
  starters: number
  reserve: number
  cancelledRegistrations: number
  eventCount: number
}

// DynamoDB item / wire shape: PK = CAPACITY#{eventType}, SK = {yyyy-mm}#{class}#{organizerId}
export interface JsonCapacityStatsItem {
  PK: string
  SK: string
  organizerId: string
  places: number
  starters: number
  reserve: number
  cancelledRegistrations: number
  eventCount: number
  updatedAt: string
}

/**
 * Starters vs. reserve for one breed in one year: what share of that breed's non-cancelled
 * entries actually got a starting position. Cancelled registrations are excluded entirely.
 */
export interface BreedStartRateEntry {
  entityId: string
  starters: number
  reserve: number
}

// DynamoDB item / wire shape: PK = STAT#{year}#breedStart, SK = breed code
export interface JsonBreedStartStatsItem {
  PK: string
  SK: string
  starters: number
  reserve: number
  updatedAt: string
}

/** How many events a judge officiated in one year, keyed by judge id (or name, for judges without one). */
export interface JudgeWorkloadEntry {
  judgeId: string
  name: string
  count: number
}

// DynamoDB item / wire shape: PK = JUDGE#{year}, SK = judgeId
export interface JsonJudgeWorkloadItem {
  PK: string
  SK: string
  name: string
  count: number
  updatedAt: string
}

/**
 * Trials organized, their starting places, starts and distinct participating handlers for one
 * year + event type. `eventType` is `ALL_EVENT_TYPES_FOR_CAPACITY` for the cross-type total,
 * whose `handlerCount` is deduplicated across event types (summing the per-type entries would
 * double-count a handler who competed in more than one event type the same year).
 */
export interface TrialStatsEntry {
  eventType: string
  eventCount: number
  places: number
  starters: number
  handlerCount: number
}

// DynamoDB item / wire shape: PK = TRIALS#{year}, SK = eventType (or ALL_EVENT_TYPES_FOR_CAPACITY)
export interface JsonTrialStatsItem {
  PK: string
  SK: string
  eventCount: number
  places: number
  starters: number
  handlerCount: number
  updatedAt: string
}
