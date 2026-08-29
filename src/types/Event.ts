import type {
  DbRecord,
  JsonDbRecord,
  JsonRegistrationDate,
  NotOptional,
  PublicJudge,
  PublicOrganizer,
  RegistrationClass,
  RegistrationDate,
  RegistrationTime,
  Replace,
  ReplaceOptional,
  User,
} from '.'
import type { DogEventCost } from './Cost'

export type PaymentTime = 'registration' | 'confirmation'
export type StartListPublishedState = boolean | Partial<Record<RegistrationClass, boolean>>

export interface JsonInvitationAttachmentVersion {
  className?: string
  uploadedAt: string
}

export interface InvitationAttachmentVersion extends Omit<JsonInvitationAttachmentVersion, 'uploadedAt'> {
  uploadedAt: Date
}

export interface JsonDogEvent extends JsonDbRecord {
  /** Short-lived server-side lock used while registration groups are reconciled. */
  registrationGroupsLock?: { expiresAt: number; token: string }
  /** Short-lived server-side lock used for dog-unique payment transitions. */
  registrationPaymentsLock?: { expiresAt: number; token: string }
  paymentTime?: PaymentTime
  classes: Array<JsonEventClass>
  contactInfo?: Partial<ContactInfo>
  cost: number | DogEventCost
  costMember?: number | DogEventCost
  description: string
  endDate: string
  entries?: number
  entryEndDate?: string
  entryOrigEndDate?: string
  entryStartDate?: string
  eventType: string
  dates?: JsonRegistrationDate[]
  headquarters?: Partial<Headquarters>
  invitationAttachment?: string
  invitationAttachmentHistory?: Record<string, JsonInvitationAttachmentVersion>
  invitationAttachments?: Record<string, string>
  judges: Array<PublicJudge>
  kcId?: number
  kcEvent?: JsonKcEventInfo
  location: string
  members?: number
  name: string
  official: Partial<User>
  organizer: PublicOrganizer
  places: number
  /**
   * Key is ISO date string (YYYY-MM-DD), value is number of places
   */
  placesPerDay?: Record<string, number>
  priority?: string[]
  qualificationStartDate?: string
  season?: string
  secretary: Partial<User>
  startDate: string
  state: EventState
  startListPublished?: StartListPublishedState
  /** Scoring posts, for event types that score at posts (NOWT). */
  stations?: JsonEventStation[]
}

type EventRequiredDates = 'startDate' | 'endDate'
type EventEntryDates = 'entryStartDate' | 'entryEndDate'
type EventOptionalDates = EventEntryDates | 'entryOrigEndDate' | 'qualificationStartDate'
type ConfirmedEventRequiredDates = EventRequiredDates | EventEntryDates

/**
 * A physical scoring post ("rasti"). Judges are stationed at a post and it persists through the day
 * while classes rotate past it, so the tasks it sets belong to the class rather than to the post.
 *
 * `maxPoints` is 20 in current practice, but the rules never state that, so it is stored rather than
 * assumed. Read the denominator and the per-post prize floor from it; never hardcode 20 or 10.
 */
export type JsonEventStation = {
  id: string
  /** Display order, "Rasti 1". */
  number: number
  name?: string
  date: string
  judge?: PublicJudge | PublicJudge[]
  maxPoints: number
}
export type EventStation = Replace<JsonEventStation, 'date', Date>

/**
 * One scored task ("tehtävä") within a class's round, run at a post. A post sets either one task
 * worth its full `maxPoints` or two that split it — two tasks never double a post's worth. The
 * tasks of one post must therefore sum to that post's `maxPoints`.
 */
export type EventClassTask = {
  id: string
  /** Order within the class's round. */
  number: number
  stationId: string
  name?: string
  maxPoints: number
}

export type JsonKcEventInfo = {
  classes: string[]
  eventType: string
  startDate: string
  endDate: string
  location: string
  judge?: string
}
export type KcEventInfo = Replace<JsonKcEventInfo, 'startDate' | 'endDate', Date>

export type DogEvent = DbRecord &
  Replace<
    Replace<
      ReplaceOptional<
        ReplaceOptional<
          ReplaceOptional<
            ReplaceOptional<
              Omit<JsonDogEvent, keyof JsonDbRecord | 'invitationAttachmentHistory'>,
              EventOptionalDates,
              Date
            >,
            'dates',
            RegistrationDate[]
          >,
          'kcEvent',
          KcEventInfo
        >,
        'stations',
        Array<EventStation>
      >,
      EventRequiredDates,
      Date
    >,
    'classes',
    Array<EventClass>
  > & {
    invitationAttachmentHistory?: Record<string, InvitationAttachmentVersion>
  }

type NonPublicDogEventProperties =
  | 'deletedAt'
  | 'deletedBy'
  | 'headquarters'
  | 'invitationAttachment'
  | 'invitationAttachmentHistory'
  | 'invitationAttachments'
  | 'kcId'
  | 'kcEvent'
  | 'official'
  | 'secretary'
  | 'createdBy'
  | 'modifiedBy'
  | 'registrationGroupsLock'
  | 'registrationPaymentsLock'

export type JsonPublicDogEvent = Omit<JsonDogEvent, NonPublicDogEventProperties>
export type SanitizedJsonPublicDogEvent = JsonPublicDogEvent & {
  [K in NonPublicDogEventProperties]?: never
}

export type PublicDogEvent = Omit<DogEvent, NonPublicDogEventProperties>
export type SanitizedPublicDogEvent = PublicDogEvent & {
  [K in NonPublicDogEventProperties]?: never
}

export type JsonEventClass = {
  class: RegistrationClass
  date: string
  groups?: RegistrationTime[]
  judge?: PublicJudge | PublicJudge[]
  places?: number
  entries?: number
  members?: number
  state?: EventClassState
  /** The class's scored round. Each post carries different tasks for each class passing through it. */
  tasks?: EventClassTask[]
}
export type EventClass = Replace<JsonEventClass, 'date', Date>

export type EventClassState = 'picked' | 'invited' | 'started' | 'ended' | 'completed'
export type ConfirmedEventStates = 'confirmed' | EventClassState
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

export type SanitizedPublicConfirmedDogEvent = PublicConfirmedEvent & {
  [K in NonPublicDogEventProperties]?: never
}

export type JsonConfirmedEvent = NotOptional<JsonDogEvent, ConfirmedEventRequiredDates> & {
  state: 'confirmed' | EventClassState
}

export type JsonPublicConfirmedEvent = NotOptional<JsonPublicDogEvent, ConfirmedEventRequiredDates> & {
  state: 'confirmed' | EventClassState
}
