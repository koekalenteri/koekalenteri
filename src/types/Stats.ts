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
  /** Non-cancelled starters (not on the waiting list) whose owner or handler is a club member. */
  memberRegistrations: number
  paidAmount: number
  refundedAmount: number
  updatedAt: string
}

export type YearlyStatTypes = 'eventType' | 'dog' | 'breed' | 'handler' | 'dog#handler' | 'class' | 'event'

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
 * Sentinel `organizerId` value for a cross-club total row in the event breakdown -- mirrors
 * `ALL_EVENT_TYPES_FOR_CAPACITY` for the organizer axis.
 */
export const ALL_ORGANIZERS_FOR_EVENTS = 'ALL'

/**
 * Events organized by one club, their starting places, starts and distinct participating
 * handlers for one year + event type. `eventType` is `ALL_EVENT_TYPES_FOR_CAPACITY` for a club's
 * cross-type subtotal, and `organizerId` is `ALL_ORGANIZERS_FOR_EVENTS` for the nationwide grand
 * total (itself only meaningful combined with `eventType === ALL_EVENT_TYPES_FOR_CAPACITY`).
 * `handlerCount` is deduplicated within whatever this entry aggregates -- summing narrower
 * entries would double-count a handler who competed for the same club in more than one event
 * type, or for more than one club, the same year.
 */
export interface EventBreakdownEntry {
  organizerId: string
  eventType: string
  eventCount: number
  places: number
  starters: number
  handlerCount: number
  /** On the waiting list: not cancelled, and not placed in a participant (starting) group. */
  reserve?: number
  cancelledRegistrations?: number
  /** Of `starters`, how many had an owner or handler who was a club member. */
  memberStarters?: number
}

// DynamoDB item / wire shape: PK = BREAKDOWN#{year}, SK = {organizerId}#{eventType} (unique, not parsed back)
export interface JsonEventBreakdownItem {
  PK: string
  SK: string
  organizerId: string
  eventType: string
  eventCount: number
  places: number
  starters: number
  handlerCount: number
  reserve?: number
  cancelledRegistrations?: number
  memberStarters?: number
  updatedAt: string
}
