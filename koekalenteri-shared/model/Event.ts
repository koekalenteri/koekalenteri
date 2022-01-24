import { Organizer } from './Organizer';

export type Event = {
  id: string
  organizer: Organizer
  eventType: string
  classes: Array<string | EventClass>
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
  official: number
  createdAt: Date
  createdBy: string
  deletedAt?: Date
  deletedBy?: string
  modifiedAt: Date
  modifiedBy: string
}

export type EventClass = {
  date: Date
  class: string
  judge: {
    id: number,
    name: string
  },
  places: number
  entries: number
  members: number
}

export interface EventEx extends Event {
  isEntryOpen: boolean
  isEntryClosing: boolean
  isEntryUpcoming: boolean
}
