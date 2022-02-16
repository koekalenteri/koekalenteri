import { Official, Organizer, Secretary } from '.';

export type Event = {
  id: string
  kcId?: number
  state: EventState
  organizer: Organizer
  eventType: string
  classes: Array<EventClass>
  startDate: Date
  endDate: Date
  entryStartDate: Date
  entryEndDate: Date
  location: string
  headquerters?: Partial<Headquarters>
  name: string
  description: string
  places: number
  entries: number
  allowOwnerMembershipPriority: boolean
  allowHandlerMembershipPriority: boolean
  cost: number
  costMember: number
  paymentDetails: string
  accountNumber: string
  referenceNumber: string
  judges: Array<number>
  official: Official
  secretary: Secretary
  contactInfo?: Partial<ContactInfo>
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

export type Headquarters = {
  name: string
  address: string
  zipCode: number
  postalDistrict: string
}

export type ContactInfo = {
  official: ShowContactInfo
  secretary: ShowContactInfo
}

export type ShowContactInfo = {
  name: boolean
  email: boolean
  phone: boolean
}

export interface EventEx extends Event {
  isEntryOpen: boolean
  isEntryClosing: boolean
  isEntryUpcoming: boolean
}
