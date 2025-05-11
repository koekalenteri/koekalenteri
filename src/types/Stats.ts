export interface OrganizerEventStats {
  organizerId: string
  eventId: string
  eventStartDate: string
  count: number // total registrations
  reserveRegistrations: number
  cancelledRegistrations: number
  paidRegistrations: number
  refundedRegistrations: number
  paidAmount: number
  refundedAmount: number
  updatedAt: string
}

export type YearlyStatTypes = 'dog' | 'breed' | 'handler' | 'owner' | 'dog#handler'

export interface YearlyTotalStat {
  year: number
  type: YearlyStatTypes
  count: number
}

// DynamoDB item types for the unified table
export interface EventStatsItem extends Partial<OrganizerEventStats> {
  PK: string
  SK: string
  count?: number
}
