import { DbRecord, JsonDbRecord, NotOptional, Official, Organizer, Replace, ReplaceOptional, Secretary } from '.';

export interface JsonEvent extends JsonDbRecord {
  kcId?: number
  state: EventState
  organizer: Organizer
  eventType: string
  classes: Array<JsonEventClass>
  startDate: string
  endDate: string
  entryStartDate?: string
  entryEndDate?: string
  entryOrigEndDate?: string
  location: string
  headquarters?: Partial<Headquarters>
  name: string
  description: string
  places: number
  entries?: number
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

export type EventRequiredDates = 'startDate' | 'endDate'
export type EventEntryDates = 'entryStartDate' | 'entryEndDate'
export type EventOptionalDates = EventEntryDates | 'entryOrigEndDate'
export type EventDates =  EventRequiredDates | EventOptionalDates
export type ConfirmedEventRequiredDates = EventRequiredDates | EventEntryDates
export type Event = DbRecord &
  Replace<
    Replace<
      ReplaceOptional<
        Omit<JsonEvent, keyof JsonDbRecord>,
        EventOptionalDates,
        Date
      >,
      EventRequiredDates,
      Date
    >,
    'classes',
    Array<EventClass>
  >

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
  zipCode: string
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

export type ConfirmedEvent = Replace<Event, ConfirmedEventRequiredDates, Date> & {
  state: 'confirmed'
}

export type JsonConfirmedEvent = NotOptional<JsonEvent, 'startDate'|'endDate'|'entryStartDate'|'entryEndDate'> & {
  state: 'confirmed'
}
