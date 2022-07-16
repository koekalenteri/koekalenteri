import { DbRecord, JsonDbRecord, NotOptional, Official, Organizer, Replace, ReplaceOptional, Secretary } from '.';

export interface JsonEvent extends JsonDbRecord {
  kcId?: number
  state: EventState
  organizer: Organizer
  eventType: string
  classes: Array<JsonEventClass>
  startDate?: string
  endDate?: string
  entryStartDate?: string
  entryEndDate?: string
  entryOrigEndDate?: string
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
}

export type EventDates = 'startDate' | 'endDate' | 'entryStartDate' | 'entryEndDate' | 'entryOrigEndDate';
export type Event = DbRecord & Replace<ReplaceOptional<Omit<JsonEvent, keyof JsonDbRecord>, EventDates, Date>, 'classes', Array<EventClass>>

export type JsonEventClass = {
  class: string
  date?: string
  judge?: {
    id: number,
    name: string
  },
  places?: number
  entries?: number
  members?: number
}
export type EventClass = ReplaceOptional<JsonEventClass, 'date', Date>

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
  statusText?: 'tentative' | 'cancelled' | 'extended'
}

export type ConfirmedEventEx = Replace<EventEx, EventDates, Date> & {
  state: 'confirmed'
}

export type JsonConfirmedEvent = NotOptional<JsonEvent, 'startDate'|'endDate'|'entryStartDate'|'entryEndDate'> & {
  state: 'confirmed'
}
