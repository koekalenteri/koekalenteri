import { Official, Organizer, Secretary } from '.';

export type Event = {
  id: string
  state: EventState
  organizer: Organizer
  eventType: string
  classes: Array<EventClass>
  startDate: Date
  endDate: Date
  entryStartDate: Date
  entryEndDate: Date
  location: string
  name: string
  description: string
  places: number
  entries: number
  allowOnlineEntry: boolean
  allowOnlinePayment: boolean
  unofficial: boolean
  allowOwnerMembershipPriority: boolean
  allowHandlerMembershipPriority: boolean
  cost: number
  costMember: number
  paymentDetails: string
  accountNumber: string
  referenceNumber: string
  requirePaymentBeforeEntry: boolean
  judges: Array<number>
  official: Official
  secretary: Secretary
  createdAt: Date
  createdBy: string
  deletedAt?: Date
  deletedBy?: string
  modifiedAt: Date
  modifiedBy: string
}

export type EventClass = {
  class: string
  date?: Date
  judge?: {
    id: number,
    name: string
  },
  places?: number
  entries?: number
  members?: number
}

export type EventState = 'draft' | 'tentative' | 'confirmed' | 'cancelled';

export interface EventEx extends Event {
  isEntryOpen: boolean
  isEntryClosing: boolean
  isEntryUpcoming: boolean
}
