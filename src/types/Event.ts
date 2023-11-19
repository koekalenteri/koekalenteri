import type {
  DbRecord,
  JsonDbRecord,
  NotOptional,
  PublicOrganizer,
  RegistrationClass,
  RegistrationTime,
  Replace,
  ReplaceOptional,
  User,
} from '.'

export interface JsonEvent extends JsonDbRecord {
  classes: Array<JsonEventClass>
  contactInfo?: Partial<ContactInfo>
  cost: number
  costMember: number
  description: string
  endDate: string
  entries?: number
  entryEndDate?: string
  entryOrigEndDate?: string
  entryStartDate?: string
  eventType: string
  headquarters?: Partial<Headquarters>
  invitationAttachment?: string
  judges: Array<number>
  kcId?: number
  location: string
  name: string
  official: Partial<User>
  organizer: PublicOrganizer
  places: number
  priority?: string[]
  secretary: Partial<User>
  startDate: string
  state: EventState
}

export type EventRequiredDates = 'startDate' | 'endDate'
export type EventEntryDates = 'entryStartDate' | 'entryEndDate'
export type EventOptionalDates = EventEntryDates | 'entryOrigEndDate'
export type EventDates = EventRequiredDates | EventOptionalDates
export type ConfirmedEventRequiredDates = EventRequiredDates | EventEntryDates
export type DogEvent = DbRecord &
  Replace<
    Replace<ReplaceOptional<Omit<JsonEvent, keyof JsonDbRecord>, EventOptionalDates, Date>, EventRequiredDates, Date>,
    'classes',
    Array<EventClass>
  >

export type ClassJudge = {
  id: number | string
  name: string
}

export type JsonEventClass = {
  class: RegistrationClass
  date: string
  groups?: RegistrationTime[]
  judge?: ClassJudge | ClassJudge[]
  places?: number
  entries?: number
  members?: number
  state?: EventClassState
}
export type EventClass = Replace<JsonEventClass, 'date', Date>

export type EventClassState = 'picked' | 'invited' | 'started' | 'ended' | 'completed'
export type EventState = 'draft' | 'tentative' | 'cancelled' | 'confirmed' | EventClassState

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

export interface ShowContactInfo {
  name?: string
  email?: string
  phone?: string
}

export type ConfirmedEvent = Replace<DogEvent, ConfirmedEventRequiredDates, Date> & {
  state: 'confirmed' | EventClassState
}

export type JsonConfirmedEvent = NotOptional<JsonEvent, 'startDate' | 'endDate' | 'entryStartDate' | 'entryEndDate'> & {
  state: 'confirmed' | EventClassState
}
