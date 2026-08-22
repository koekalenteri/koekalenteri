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

export type YearlyStatTypes = 'eventType' | 'dog' | 'breed' | 'handler' | 'owner' | 'dog#handler'

export interface YearlyTotalStat {
  year: number
  type: YearlyStatTypes
  count: number
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
 * Monthly available-places-vs-actual-starters aggregate for one event type + class,
 * used to gauge audience demand when planning future events.
 */
export interface CapacityStatsEntry {
  month: string // yyyy-mm
  eventType: string
  class: string // RegistrationClass, or eventType for classless event types
  places: number
  starters: number
  reserve: number
  cancelledRegistrations: number
  eventCount: number
}

// DynamoDB item / wire shape: PK = CAPACITY#{eventType}, SK = {yyyy-mm}#{class}
export interface JsonCapacityStatsItem {
  PK: string
  SK: string
  places: number
  starters: number
  reserve: number
  cancelledRegistrations: number
  eventCount: number
  updatedAt: string
}
