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
