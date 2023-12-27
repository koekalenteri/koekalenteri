import type {
  DbRecord,
  JsonDbRecord,
  NotOptional,
  PublicJudge,
  PublicOrganizer,
  RegistrationClass,
  RegistrationTime,
  Replace,
  ReplaceOptional,
  User,
} from '.'

export interface JsonDogEvent extends JsonDbRecord {
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
  judges: Array<PublicJudge>
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
    Replace<
      ReplaceOptional<Omit<JsonDogEvent, keyof JsonDbRecord>, EventOptionalDates, Date>,
      EventRequiredDates,
      Date
    >,
    'classes',
    Array<EventClass>
  >

type NonPublicDogEventProperties =
  | 'deletedAt'
  | 'deletedBy'
  | 'headquarters'
  //| 'invitationAttachment' @todo fetch invitationAttachment separately for registrationViewPage
  | 'kcId'
  | 'official'
  | 'secretary'
  | 'createdBy'
  | 'modifiedBy'

export type JsonPublicDogEvent = Omit<JsonDogEvent, NonPublicDogEventProperties>
export type SanitizedJsonPublicDogEvent = JsonPublicDogEvent & {
  [K in NonPublicDogEventProperties]?: never
}

export type PublicDogEvent = Omit<DogEvent, NonPublicDogEventProperties>
export type SanitizedPublicDogEvent = PublicDogEvent & {
  [K in NonPublicDogEventProperties]?: never
}

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
  official: PublicContactInfo
  secretary: PublicContactInfo
}

export interface PublicContactInfo {
  name?: string
  email?: string
  phone?: string
}

export type ConfirmedEvent = NotOptional<DogEvent, ConfirmedEventRequiredDates> & {
  state: 'confirmed' | EventClassState
}

export type PublicConfirmedEvent = NotOptional<PublicDogEvent, ConfirmedEventRequiredDates> & {
  state: 'confirmed' | EventClassState
}

export type JsonConfirmedEvent = NotOptional<JsonDogEvent, ConfirmedEventRequiredDates> & {
  state: 'confirmed' | EventClassState
}

export type JsonPublicConfirmedEvent = NotOptional<JsonPublicDogEvent, ConfirmedEventRequiredDates> & {
  state: 'confirmed' | EventClassState
}
