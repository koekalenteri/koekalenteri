import type {
  DbRecord,
  EventResult,
  JsonDbRecord,
  JsonEventResult,
  JsonRegistrationDate,
  JsonRegistrationGroup,
  NotOptional,
  PublicJudge,
  PublicOrganizer,
  RegistrationClass,
  RegistrationDate,
  RegistrationGroup,
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
  /**
   * Whether the start numbers ride the published start list (KOE-1006). Same shape as
   * `startListPublished`, and gated behind it: numbers cannot be public on an unpublished list.
   * Absent means published — every event before the flag put its numbers out with the list — and
   * only an explicit `false` withholds them; new events are created with `false` so the choice is
   * the secretary's.
   */
  startNumbersPublished?: StartListPublishedState
  resultsPublished?: ResultsPublishedState
  /** Scoring posts, for event types that score at posts (NOWT). */
  stations?: JsonEventStation[]
  /**
   * The live timeline of the trial day (KOE-1259): every span a post has run, turns and breaks alike,
   * appended as the day goes. Server-owned — written only through the turn endpoint, never by an
   * event save — and stripped from the public event, which carries the derived `liveTurns` instead.
   */
  turns?: JsonStationTurn[]
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
  /**
   * How many dogs this post takes at once (KOE-1259): one, a pair task, or a walk-up. It is the
   * post's own form, fixed for the whole trial, so it lives here beside `tasks` rather than on each
   * turn — and it stays a plain count, because a wider walk-up must not need a code change. Absent
   * means one. Note the trap it shares a number with: two *tasks* worth ten points each and a *pair*
   * task run by two dogs are different axes.
   */
  dogsAtOnce?: number
  /** Versions the post's tokenized entry link (KOE-1258); bumping it revokes every link issued. */
  tokenVersion?: number
}
export type EventStation = Replace<JsonEventStation, 'date', Date>

/** A break is labeled with a code rather than free text, so the day's pauses can be counted later. */
export type StationTurnPause = 'coffee' | 'lunch' | 'weather' | 'other'

/**
 * What a turn can say about a dog beyond that it ran (KOE-1259), for the formats whose live facts are
 * marks rather than scores — NOME-A, where all four dogs are on the same retrieve.
 *
 * `eyeWipe` and `firstDogDown` are the judge's calls, not derivations: neither "comparable conditions"
 * nor "was findable" is computable from the order of attempts, so they are recorded, never inferred.
 * Both are serious faults rather than eliminating ones, which is why they belong in the live vocabulary
 * at all — the stop they can cause publishes as an interruption, not as a dash.
 */
export type LiveMark = 'sent' | 'found' | 'notFound' | 'eyeWipe' | 'firstDogDown'

/** The public face of a dog in a turn: what the published start list already tells. */
export interface JsonStationTurnDog {
  name: string
  number?: number
  /** How this dog's turn is going, where the format has a mark vocabulary. */
  mark?: LiveMark
}

/**
 * One span of a post's day as the public may see it: a turn holding a group of dogs, or a break
 * holding none. The span with no `endedAt` is what is happening right now; throughput is the closed
 * spans measured. Timestamps stay ISO strings on both sides of the wire.
 */
export interface JsonPublicStationTurn {
  id: string
  /** The post this span belongs to; `'1'` for the implicit single post of formats without stations. */
  stationId: string
  /** Denormalized at write time so the public projection never needs the registrations. */
  dogs: JsonStationTurnDog[]
  startedAt: string
  endedAt?: string
  pause?: StationTurnPause
  /**
   * Which of the post's tasks this turn ran, 0-based — recorded only where the format lets a class
   * take the post's tasks in an order of its own (NOME-B). Where the post is one turn (NOWT) or the
   * order is fixed (NOU) there is nothing to record.
   */
  taskIndex?: number
}

/** The stored span (KOE-1259): the public shape plus the registration ids, which never leave admin. */
export interface JsonStationTurn extends JsonPublicStationTurn {
  registrationIds: string[]
}

/** The turn as the browser holds it, timestamps revived to `Date` by the http layer. */
export type PublicStationTurn = Replace<ReplaceOptional<JsonPublicStationTurn, 'endedAt', Date>, 'startedAt', Date>
export type StationTurn = Replace<ReplaceOptional<JsonStationTurn, 'endedAt', Date>, 'startedAt', Date>

/**
 * What a post can do to its timeline: put a group of dogs to work, put the post on a break, or close
 * the open span. Starting anything closes the open span first — at the post the next thing beginning
 * is what says the previous one ended, and one tap must be enough.
 */
export type StationTurnOp =
  | { type: 'start'; registrationIds: string[]; taskIndex?: number }
  | { type: 'break'; pause: StationTurnPause }
  | { type: 'end' }
  /**
   * Mark one dog of the open turn, by its position in that turn rather than by registration id — the
   * tokenized station link works from the public shape, which has no ids to name a dog by.
   */
  | { type: 'mark'; index: number; mark: LiveMark }

/**
 * One dog as a station secretary's tokenized link may see it: enough to call the dog up and score it,
 * nothing more. Owner and handler details stay off a link this widely shared.
 */
export interface JsonStationEntryDog {
  id: string
  class?: RegistrationClass | null
  eventType: string
  group?: JsonRegistrationGroup
  dog: { name?: string }
  /** This post's own recordings only; the rest of the round is not this link's to see. */
  eventResult?: Pick<JsonEventResult, 'elimination' | 'retirement' | 'tasks'>
}
export type StationEntryDog = Omit<JsonStationEntryDog, 'group' | 'eventResult'> & {
  group?: RegistrationGroup
  eventResult?: Pick<EventResult, 'elimination' | 'retirement' | 'tasks'>
}

/** What the tokenized station link serves: the post, its slice of the course, and the dogs that run. */
export interface JsonStationEntry {
  event: Pick<JsonPublicDogEvent, 'id' | 'eventType' | 'name' | 'location' | 'startDate' | 'endDate' | 'classes'>
  /** Without `tokenVersion`: the link must not reveal its own revocation counter. */
  station: Omit<JsonEventStation, 'tokenVersion'>
  registrations: JsonStationEntryDog[]
  /** This post's own timeline (KOE-1259), in the public shape — the link runs the turns it sees. */
  turns?: JsonPublicStationTurn[]
}
export type StationEntry = {
  event: Pick<PublicDogEvent, 'id' | 'eventType' | 'name' | 'location' | 'startDate' | 'endDate' | 'classes'>
  station: Omit<EventStation, 'tokenVersion'>
  registrations: StationEntryDog[]
  turns?: PublicStationTurn[]
}

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
        'turns',
        Array<StationTurn>
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
  | 'turns'

export type JsonPublicDogEvent = Omit<JsonDogEvent, NonPublicDogEventProperties> & {
  /** The stored `turns` without their registration ids, derived by `sanitizeDogEvent`. */
  liveTurns?: JsonPublicStationTurn[]
}
export type SanitizedJsonPublicDogEvent = JsonPublicDogEvent & {
  [K in NonPublicDogEventProperties]?: never
}

export type PublicDogEvent = Omit<DogEvent, NonPublicDogEventProperties> & {
  liveTurns?: PublicStationTurn[]
}
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
