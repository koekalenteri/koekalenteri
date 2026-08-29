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

/**
 * Same shape as `StartListPublishedState`, so per-class publishing works the same way — but not the
 * same default. An absent start list flag means published, for records that predate it; an absent
 * results flag means not published, because a result nobody released must never appear.
 */
export type ResultsPublishedState = boolean | Partial<Record<RegistrationClass, boolean>>

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
  resultsPublished?: ResultsPublishedState
  /** Scoring posts, for event types that score at posts (NOWT). */
  stations?: JsonEventStation[]
}

type EventRequiredDates = 'startDate' | 'endDate'
type EventEntryDates = 'entryStartDate' | 'entryEndDate'
type EventOptionalDates = EventEntryDates | 'entryOrigEndDate' | 'qualificationStartDate'
type ConfirmedEventRequiredDates = EventRequiredDates | EventEntryDates

/**
 * A physical scoring post ("rasti"). Judges are stationed at a post and it persists through the day
 * while the classes rotate past it, each running its own exercise there.
 *
 * `tasks` is the course as built, which a class may override through `JsonEventClassStation`. A post is
 * always worth `STATION_MAX_POINTS` and its tasks split that evenly, so what varies is the number of
 * tasks, never the maximum — deriving each task's ceiling from the split rather than storing it means a
 * post's tasks cannot fail to add up to the post.
 */
export type JsonEventStation = {
  id: string
  /** Posts are never named, only numbered 1..n within their own day. */
  number: number
  date: string
  /**
   * Several judges may work one post (§5.7). Always an array: `classes[].judge` carries a legacy
   * single-judge shape, but this field is new and has no such history to accommodate.
   */
  judges?: PublicJudge[]
  /** One task worth the post's full points, or two worth half each. */
  tasks: 1 | 2
}
export type EventStation = Replace<JsonEventStation, 'date', Date>

/**
 * How many tasks one class runs at a post, where that differs from the post's own layout.
 *
 * A course is normally built once and every class runs it as laid out, so this is an override rather
 * than a requirement: absent an entry, the class follows `JsonEventStation.tasks`. Keeping the two
 * separate leaves room for a class to split a post the others do not, without duplicating the whole
 * course per class.
 */
export type JsonEventClassStation = {
  stationId: string
  tasks: 1 | 2
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
  /** Posts this class splits differently from the course as built. Absent entries follow the post. */
  stations?: JsonEventClassStation[]
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
