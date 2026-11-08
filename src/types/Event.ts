import type {
  DayKey,
  DbRecord,
  JsonDbRecord,
  JsonRegistrationDate,
  JsonRegistrationGroup,
  JsonStationEventResult,
  JsonUser,
  Language,
  NotOptional,
  PublicJudge,
  PublicOrganizer,
  RegistrationClass,
  RegistrationGroup,
  RegistrationTime,
  Replace,
  ReplaceOptional,
  StationEventResult,
  User,
} from '.'
import type { DogEventCost, MinimalEventForCost } from './Cost'

export type PaymentTime = 'registration' | 'confirmation'
/** What a B-trial's dogs retrieve (KOE-439): shot game, or dummies standing in for it. */
export type RetrieveType = 'game' | 'dummies'
/** The official types an unofficial trial may follow (KOE-1718): their format runs the trial. */
export const OFFICIAL_FORMATS = ['NOU', 'NOME-B', 'NOME-A', 'NOWT'] as const
export type OfficialFormat = (typeof OFFICIAL_FORMATS)[number]
export type StartListPublishedState = boolean | Partial<Record<RegistrationClass, boolean>>

/**
 * Which days' start numbers are out: every day (`true`), none (`false`), or the listed days as
 * yyyy-MM-dd in the event's time zone (KOE-1304). A multi-day class draws its numbers one morning at
 * a time, so one day's numbers can be public while the next day's draw is still to come.
 *
 * A day can also be out by halves (KOE-1430): some trials draw the morning and the afternoon
 * separately, and the afternoon's draw comes only once the morning is under way. Half a day is
 * listed as the day key and the time it ran, `yyyy-MM-dd/ap` or `yyyy-MM-dd/ip`; a bare day key
 * covers every time of that day, and a day whose every half is out is stored as the bare key.
 *
 * Day keys on both sides of the wire (KOE-1546); a half-day entry carries its time after the key.
 */
export type StartNumbersDayScope = boolean | string[]
export type StartNumbersPublishedState = StartNumbersDayScope | Partial<Record<RegistrationClass, StartNumbersDayScope>>

/**
 * Which days' results are out: every day (`true`), none (`false`), or the listed days as yyyy-MM-dd
 * in the event's time zone (KOE-1510). Each day of a multi-day class is published on its own, so the
 * first day's results can be public while the second day is still being scored. Whole days only: the
 * halves start numbers can be drawn in do not apply to results.
 *
 * Day keys on both sides of the wire, as `StartNumbersDayScope` (KOE-1546).
 */
export type ResultsDayScope = boolean | string[]

/** A class, or none for a classless event (NOU, NOME-A), whose one flag covers the whole event. */
export type ClassOrNone = RegistrationClass | undefined

/**
 * Per class like `StartListPublishedState`, or one scope for a classless event, but not the same
 * default. An absent start list flag means published, for records that predate it; an absent results
 * flag means not published, because a result nobody released must never appear.
 */
export type ResultsPublishedState = ResultsDayScope | Partial<Record<RegistrationClass, ResultsDayScope>>

export interface JsonInvitationAttachmentVersion {
  className?: string
  uploadedAt: string
}

export interface InvitationAttachmentVersion extends Omit<JsonInvitationAttachmentVersion, 'uploadedAt'> {
  uploadedAt: Date
}

export interface JsonDogEvent extends JsonDbRecord {
  /**
   * `organizer.id` lifted to a top-level attribute, because a DynamoDB index key cannot reach into
   * a map: `gsiOrganizerStartDate` is keyed on it, so a club's administrator reads the club's
   * events without a scan (KOE-1341). Written with the event and backfilled by a migration; the
   * stored row's own bookkeeping, never sent to a reader.
   */
  organizerId?: string
  /** Short-lived server-side lock used while registration groups are reconciled. */
  registrationGroupsLock?: { expiresAt: number; token: string }
  /** Short-lived server-side lock used for dog-unique payment transitions. */
  registrationPaymentsLock?: { expiresAt: number; token: string }
  paymentTime?: PaymentTime
  classes: Array<EventClass>
  /**
   * Where a copy in test or dev came from (KOE-1471): the environment, the event there, when and by
   * whom. Its people are stand-ins; absent on every event that is not such a copy.
   */
  copiedFrom?: { at: string; by: string; eventId: string; stage: string }
  contactInfo?: Partial<ContactInfo>
  cost: number | DogEventCost
  costMember?: number | DogEventCost
  description: string
  /**
   * The additional info in other languages (KOE-1263). `description` stays the Finnish text and the
   * fallback; keying the translations by language makes a new language a key, not a schema change.
   */
  descriptions?: Partial<Record<Language, string>>
  endDate: DayKey
  entries?: number
  entryEndDate?: DayKey
  entryOrigEndDate?: DayKey
  entryStartDate?: DayKey
  eventType: string
  dates?: JsonRegistrationDate[]
  headquarters?: Partial<Headquarters>
  invitationAttachment?: string
  invitationAttachmentHistory?: Record<string, JsonInvitationAttachmentVersion>
  invitationAttachments?: Record<string, string>
  judges: Array<PublicJudge>
  /** The integer of the old Kennelliitto API. A record only: nothing new trusts it (KOE-1534). */
  kcId?: number
  /**
   * The Kennelliitto trial this event is linked to, found with Koe/Kokeet (KOE-1534). A GUID belongs
   * to one KL environment (Testi2 or production) and never travels with a copy of the event.
   */
  kcGuid?: string
  kcEvent?: KcEventInfo
  /**
   * What Kennelliitto last said of the linked trial's state (Koe/Lue), refreshed whenever results are
   * previewed, sent or handed over. Server-owned: an event save never writes it. A trial handed to the
   * chief judge (1253) or finished (304) locks its results here (`isResultsLocked`).
   */
  kcState?: JsonKcState
  location: string
  members?: number
  /**
   * Whether a NOWT trial is a Mock trial (KOE-308): a rehearsal of the A-trial run under the working
   * test's rules, in the AVO and VOI classes only, and judged by A-trial judges or by NOWT judges
   * named for it (KOE-1357). The Kennel Club knows it only as a working test. Absent on every other
   * trial.
   */
  mockTrial?: boolean
  name: string
  /** The event name in other languages (KOE-1263), keyed like `descriptions`; `name` is the fallback. */
  names?: Partial<Record<Language, string>>
  /** The user picked for the role, as the users list holds it: with the row's own stamps. */
  official: Partial<JsonUser>
  /**
   * The official type an unofficial trial follows (KOE-1718), chosen by its secretary: the classes,
   * the judges, the entry times, the posts, the live view and the results then run by that type's
   * format (`formatTypeOf`). Eligibility, Kennelliitto and the statistics stay the trial's own. Absent
   * where the trial follows none, and ignored on an official type. Locked once a result or a turn is
   * saved (`isOfficialFormatLocked`).
   */
  officialFormat?: OfficialFormat
  organizer: PublicOrganizer
  places: number
  /**
   * Key is ISO date string (YYYY-MM-DD), value is number of places
   */
  placesPerDay?: Record<string, number>
  priority?: string[]
  /**
   * Who may enter at all (KOE-524): the organizer's members, the named breeds, or both. Same values
   * as `priority` bar the organizer's invitations, which single out dogs rather than narrow the entry.
   * A priority favours a group when places run short; a restriction keeps everyone else out.
   */
  restrictions?: string[]
  qualificationStartDate?: DayKey
  /**
   * Whether the trial is run with game or with dummies (KOE-439). A B-trial's choice, made when the
   * trial is created and shown in the calendar; absent where the format does not choose, and on
   * B-trials created before the field.
   */
  retrieveType?: RetrieveType
  season?: string
  secretary: Partial<JsonUser>
  startDate: DayKey
  state: EventState
  startListPublished?: StartListPublishedState
  /**
   * Whether the start numbers ride the published start list (KOE-1006). Same shape as
   * `startListPublished`, and gated behind it: numbers cannot be public on an unpublished list.
   * Absent means published — every event before the flag put its numbers out with the list — and
   * only an explicit `false` withholds them; new events are created with `false` so the choice is
   * the secretary's. A day list publishes part of a multi-day class (KOE-1304).
   */
  startNumbersPublished?: StartNumbersPublishedState
  /**
   * Versions the class secretaries' start number links (KOE-1267), keyed by the class the link opens,
   * or where the trial has no classes by its format (`getRegistrationClass`, KOE-1718), the key its dogs
   * are read under too.
   * Bumping a class's number revokes every link issued for it; absent reads as version 1, the way a
   * post's `tokenVersion` does.
   */
  startNumberLinkVersions?: Record<string, number>
  resultsPublished?: ResultsPublishedState
  /** The judges' posts, for event types scored by exercise (NOWT). */
  stations?: EventStation[]
  /**
   * The groups of the day with their running orders (KOE-1665): which exercises a class, or a range of
   * its start numbers, does at which posts and in which order. A class with no group on a day does one
   * exercise at each of that day's posts in number order. Public on purpose: the start list tells the
   * handlers their group's running order.
   */
  rotations?: EventRotationGroup[]
  /**
   * The live timeline of the trial day (KOE-1259): every span a post has run, turns and breaks alike,
   * appended as the day goes. Server-owned — written only through the turn endpoint, never by an
   * event save — and stripped from the public event, which carries the derived `liveTurns` instead.
   */
  turns?: JsonStationTurn[]
}

type EventRequiredDates = 'startDate' | 'endDate'
type EventEntryDates = 'entryStartDate' | 'entryEndDate'
type ConfirmedEventRequiredDates = EventRequiredDates | EventEntryDates

/**
 * A post ("suorituspaikka"): a judge's fixed place for the day, which the groups pass in their running
 * order. An exercise ("rasti", the rules' 20-point performance) is done at a post; a group may do two
 * in a row at one (KOE-1665). `parts` and `dogsAtOnce` are the post's defaults, which an exercise of a
 * group's running order may override (`EventExercise`).
 */
export type EventStation = {
  id: string
  /** Posts are never named, only numbered 1..n within their own day. */
  number: number
  date: DayKey
  /**
   * Several judges may work one post (NOWT §5.3.1). Always an array: `classes[].judge` carries a legacy
   * single-judge shape, but this field is new and has no such history to accommodate.
   */
  judges?: PublicJudge[]
  /** The parts each exercise here splits into: one part of 20 points, or two of 10. Absent is one. */
  parts?: 1 | 2
  /**
   * The name `parts` had on rows stored before KOE-1665, when a post was always worth 20 and `tasks: 2`
   * split it in two. Read only through `stationParts` (src/lib/rotation.ts); the posts page drops it.
   */
  tasks?: 1 | 2
  /**
   * How many dogs this post takes at once (KOE-1259): one, a pair task, or a walk-up. It is the post's
   * default, which a group's visit may override (`EventExercise`, KOE-1665), and it stays
   * a plain count, because a wider walk-up must not need a code change. Absent means one. Note the trap
   * it shares a number with: a task in two *parts* and a *pair* task run by two dogs are different axes.
   */
  dogsAtOnce?: number
  /** Versions the post's tokenized entry link (KOE-1258); bumping it revokes every link issued. */
  tokenVersion?: number
  /**
   * The phases of the day at this post, in order, as its secretary wrote them down — for a format
   * whose phases are the post's own (NOME-B). A format with fixed phases (NOU) ignores this.
   */
  phases?: string[]
}

/** A break is labeled with a code rather than free text, so the day's pauses can be counted later. */
export type StationTurnPause = 'coffee' | 'lunch' | 'weather' | 'other'

/**
 * What a turn can say about a dog beyond that it ran (KOE-1259), for the formats whose live facts are
 * marks rather than scores — NOME-A, where all four dogs are on the same retrieve.
 *
 * The words are the ones said out loud at the post, because a vocabulary nobody uses is one nobody
 * reaches for in the rain: a dog is *noudossa*, and it either *sai noudon* or there is *ei noutoa*.
 * The unit is the nouto, not the finding — "löysi" describes the dog's nose, "sai noudon" describes
 * what the trial records.
 *
 * `eyeWipe` and `firstDogDown` are the judge's calls, not derivations: neither "comparable conditions"
 * nor "was findable" is computable from the order of attempts, so they are recorded, never inferred.
 * Both are serious faults rather than eliminating ones, which is why they belong in the live vocabulary
 * at all — the stop they can cause publishes as an interruption, not as a dash.
 */
export type LiveMark = 'onRetrieve' | 'gotRetrieve' | 'noRetrieve' | 'eyeWipe' | 'firstDogDown'

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
  /**
   * The exercise the turn is for, by its number in the dogs' running order, where the post scores
   * exercises (KOE-1665): a dog doing two exercises at a post comes to it twice. Absent on a turn stored
   * before and in the formats without exercises, where it is the post's only one.
   */
  exercise?: number
  startedAt: string
  endedAt?: string
  pause?: StationTurnPause
  /**
   * The phases this run has entered, in order, each with when it began — the key of a fixed phase
   * (NOU) or the label of the post's own (NOME-B). One run is one span whatever its phases, so the
   * last entry is the phase under way and each phase's time falls out of the sequence. A whole-entry
   * phase such as the briefing is a span with a phase and no dogs.
   */
  phases?: JsonStationTurnPhase[]
}

/** One phase of a run, and when the run entered it. */
export interface JsonStationTurnPhase {
  key: string
  startedAt: string
}
export type StationTurnPhase = Replace<JsonStationTurnPhase, 'startedAt', Date>

/** The stored span (KOE-1259): the public shape plus the registration ids, which never leave admin. */
export interface JsonStationTurn extends JsonPublicStationTurn {
  registrationIds: string[]
}

/** The turn as the browser holds it, timestamps made `Date`s at the typed boundary (`lib/wire.ts`). */
export type PublicStationTurn = Replace<
  ReplaceOptional<ReplaceOptional<JsonPublicStationTurn, 'endedAt', Date>, 'phases', StationTurnPhase[]>,
  'startedAt',
  Date
>
export type StationTurn = Replace<
  ReplaceOptional<ReplaceOptional<JsonStationTurn, 'endedAt', Date>, 'phases', StationTurnPhase[]>,
  'startedAt',
  Date
>

/**
 * What a post can do to its timeline: put a group of dogs to work, put the post on a break, or close
 * the open span. Starting anything closes the open span first — at the post the next thing beginning
 * is what says the previous one ended, and one tap must be enough.
 */
export type StationTurnOp =
  | { type: 'start'; registrationIds: string[]; phase?: string; exercise?: number }
  | { type: 'break'; pause: StationTurnPause }
  | { type: 'end' }
  /** Move the open run on to the next phase of the day, closing the phase it is in. */
  | { type: 'next' }
  /**
   * Mark one dog of the open turn, by its position in that turn rather than by registration id — the
   * tokenized station link works from the public shape, which has no ids to name a dog by.
   */
  | { type: 'mark'; index: number; mark: LiveMark }

/**
 * What a dog's group does on one visit to a post (KOE-1665): one exercise of its running order, derived
 * from the running order, never stored. The link has neither the running order nor the dog's frozen
 * number to work it out, so the server sends it.
 */
export interface StationVisitLayout {
  /** The exercise's number in the group's running order, from 1. */
  exercise: number
  /** The parts it splits into. */
  parts: 1 | 2
  /**
   * How many dogs a turn of this exercise holds: its own figure, or the post's default. Absent where
   * neither sets one. The format's fixed figure still wins over it (`stationDogsAtOnce`).
   */
  dogsAtOnce?: number
  /**
   * The posts of the group's whole running order, an exercise each, in its order: where a dog's round
   * ended (`endedAtExercise`) and so which exercises it never reached, which the post shows as "kesk"
   * (KOE-1669).
   */
  exercisePosts: string[]
}

/**
 * One dog as a judge's secretary's live entry link may see it: enough to call the dog up and score it,
 * nothing more. Owner and handler details stay off a link this widely shared.
 */
export interface JsonStationEntryDog {
  id: string
  class?: RegistrationClass | null
  eventType: string
  group?: JsonRegistrationGroup
  dog: { name?: string }
  /** Where the post scores tasks: what the dog's group does here. Absent for a qualitative type. */
  visit?: StationVisitLayout
  /**
   * This post's own recordings only; the rest of the round is not this link's to see. The result and
   * the judge ride along for a qualitative type alone, whose post is the whole trial.
   */
  eventResult?: Pick<JsonStationEventResult, 'elimination' | 'retirement' | 'tasks' | 'result' | 'judge'> &
    Partial<Pick<JsonStationEventResult, 'updatedAt'>>
}
export type StationEntryDog = Omit<JsonStationEntryDog, 'group' | 'eventResult'> & {
  group?: RegistrationGroup
  eventResult?: Pick<StationEventResult, 'elimination' | 'retirement' | 'tasks' | 'result' | 'judge'> &
    Partial<Pick<StationEventResult, 'updatedAt'>>
}

/**
 * The trial as a tokenized link may see it: what the screen needs to head its sheet, and no more.
 * Every link family serves the same head, so they share the reading of what "no more" means.
 */
export type JsonLinkedEvent = Pick<
  JsonPublicDogEvent,
  'id' | 'eventType' | 'name' | 'names' | 'location' | 'startDate' | 'endDate' | 'classes' | 'officialFormat'
>
export type LinkedEvent = Pick<
  PublicDogEvent,
  'id' | 'eventType' | 'name' | 'names' | 'location' | 'startDate' | 'endDate' | 'classes' | 'officialFormat'
>

/** The results are handed to the chief judge: the post's link can read them but no longer write them. */
interface StationEntryLock {
  locked?: boolean
}

/** What the tokenized station link serves: the post, its slice of the course, and the dogs that run. */
export interface JsonStationEntry {
  event: JsonLinkedEvent & StationEntryLock
  /** Without `tokenVersion`: the link must not reveal its own revocation counter. */
  station: Omit<EventStation, 'tokenVersion'>
  registrations: JsonStationEntryDog[]
  /** This post's own timeline (KOE-1259), in the public shape — the link runs the turns it sees. */
  turns?: JsonPublicStationTurn[]
}
export type StationEntry = {
  event: LinkedEvent & StationEntryLock
  station: Omit<EventStation, 'tokenVersion'>
  registrations: StationEntryDog[]
  turns?: PublicStationTurn[]
}

/**
 * One dog as a class secretary's start number link may see it (KOE-1267). The draw happens with the
 * dogs and their handlers present, so this is the same sheet the event secretary works from: the
 * working order the class has, and the number drawn against it.
 */
export interface JsonClassStartNumberDog {
  id: string
  class?: RegistrationClass | null
  eventType: string
  dog: { name?: string; regNo?: string }
  handler?: { name?: string }
  group?: JsonRegistrationGroup
  /** The frozen placement, once the draw has been entered or the numbers published. */
  startGroup?: JsonRegistrationGroup
}
export type ClassStartNumberDog = Omit<JsonClassStartNumberDog, 'group' | 'startGroup'> & {
  group?: RegistrationGroup
  startGroup?: RegistrationGroup
}

/**
 * A number that is already someone else's, named without naming the dog (KOE-1267). The holder's
 * class is the part that makes it act-on-able: the draw sheet shows one class, and the number that
 * blocks it is usually in another.
 */
export interface ReservedStartNumber {
  number: number
  /** The class the holder runs in, where the trial runs classes at all. */
  eventClass?: string
}

/**
 * What the tokenized start number link serves: one class of one trial, and the dogs that run in it.
 * The class is the whole scope — the link neither sees nor writes another class's dogs.
 */
export interface JsonClassStartNumbers {
  event: JsonLinkedEvent
  /** The class the link opens, or the event type where the trial runs no classes. */
  eventClass: string
  registrations: JsonClassStartNumberDog[]
  /**
   * The numbers already gone elsewhere in the trial, the one thing the link is told about dogs it
   * cannot see. Without it a taken number looks free until the save is refused (KOE-1267).
   */
  reserved: ReservedStartNumber[]
}
export type ClassStartNumbers = {
  event: LinkedEvent
  eventClass: string
  registrations: ClassStartNumberDog[]
  reserved: ReservedStartNumber[]
}

/** What a start number save changed: the dog's frozen placement, or null where a cancelled holder yielded it. */
export interface JsonStartNumberPatch {
  id: string
  startGroup?: JsonRegistrationGroup | null
}
export type StartNumberPatch = ReplaceOptional<JsonStartNumberPatch, 'startGroup', RegistrationGroup | null>

/**
 * One exercise ("rasti") of a group's running order (KOE-1665): a 20-point performance at a post. Its
 * number is its place in the order, from 1.
 */
export interface EventExercise {
  stationId: string
  /** The parts it splits into. Absent follows the post's `parts`. */
  parts?: 1 | 2
  /** How many dogs a turn of this exercise holds. Absent follows the post's `dogsAtOnce`. */
  dogsAtOnce?: number
}

/**
 * A group ("ryhmä"): one class, or the start numbers `firstNumber`..`lastNumber` of it, on the day of
 * its posts, with its running order ("suoritusjärjestys"). A start number is the dog's own across the
 * whole event, so a range names the dogs it holds. The day is not stored: it is the day of the posts,
 * which are all on one day.
 */
export interface EventRotationGroup {
  class: RegistrationClass
  /** Both or neither. Without a range the group is the whole class. */
  firstNumber?: number
  lastNumber?: number
  /**
   * The running order: at least one exercise, the exercises at one post in a row. Absent on a group
   * stored before the exercises (dev only, as `posts`), which reads as a group without any.
   */
  exercises?: EventExercise[]
}

export type KcEventInfo = {
  classes: string[]
  eventType: string
  /**
   * The trial's days as Kennelliitto lists them. Either may be missing: its empty date (year 1, which it
   * gives as a one-day trial's end) was stored as it came before KOE-1547, and the migration removed it.
   */
  startDate?: DayKey
  endDate?: DayKey
  /** Absent when Kennelliitto's details of the trial could not be read, so no false warning follows. */
  location?: string
  judge?: string
  /** The chief judge's member number (ylituomariNumero); the judge warning compares numbers. */
  judgeId?: number
}

export type JsonKcState = {
  code: number
  name: string
  readAt: string
}
export type KcState = Replace<JsonKcState, 'readAt', Date>

/** A trial as Kennelliitto lists it, as the kcId search answers: its days as ISO timestamps. */
export type EventKcIdChoice = {
  classes: string[]
  contactInfo?: NonNullable<JsonDogEvent['contactInfo']>
  cost?: JsonDogEvent['cost']
  description?: JsonDogEvent['description']
  judge?: string
  /** The chief judge's member number, which the judge warning compares with the event's judges. */
  judgeId?: number
  /** Null for a trial Kennelliitto has not given a GUID: it is shown, and cannot be selected (KOE-1534). */
  kcGuid: string | null
  kcTunnus?: string
  name: string
  eventType: string
  startDate: DayKey
  endDate: DayKey
  entryStartDate?: DayKey
  entryEndDate?: DayKey
  organizer: string
  /** Absent when the trial's details could not be read from Kennelliitto. */
  location?: string
  status?: string
}

/** The browser's event: its days are the day keys the server sends (KOE-1547), its moments `Date`s. */
export type DogEvent = DbRecord &
  ReplaceOptional<
    Omit<JsonDogEvent, keyof JsonDbRecord | 'invitationAttachmentHistory' | 'kcState' | 'official' | 'secretary'>,
    'turns',
    Array<StationTurn>
  > & {
    invitationAttachmentHistory?: Record<string, InvitationAttachmentVersion>
    kcState?: KcState
    official: Partial<User>
    secretary: Partial<User>
  }

type NonPublicDogEventProperties =
  | 'deletedAt'
  | 'deletedBy'
  | 'headquarters'
  | 'invitationAttachment'
  | 'invitationAttachmentHistory'
  | 'invitationAttachments'
  | 'kcId'
  | 'kcGuid'
  | 'kcEvent'
  | 'kcState'
  | 'official'
  | 'secretary'
  | 'createdBy'
  | 'modifiedBy'
  | 'registrationGroupsLock'
  | 'registrationPaymentsLock'
  | 'organizerId'
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

export type EventClass = {
  class: RegistrationClass
  date: DayKey
  groups?: RegistrationTime[]
  judge?: PublicJudge | PublicJudge[]
  places?: number
  entries?: number
  members?: number
  state?: EventClassState
}

export type EventClassState = 'picked' | 'invited' | 'started' | 'ended' | 'completed'
export type ConfirmedEventStates = 'confirmed' | EventClassState
/** Why the target environment cannot use one of a copied event's judges as it is (KOE-1471). */
export interface EventCopyJudgeNotice {
  name: string
  reason: 'missing' | 'inactive' | 'eventType' | 'mockTrial'
}

/** An event the target environment already holds as a copy of the same source event (KOE-1639). */
export interface EventCopyExisting {
  eventId: string
  name: string
}

/** The body of the 409 a copy is refused with when the target already holds a live copy of the source. */
export interface EventCopyRefusal {
  error: 'alreadyCopied'
  existing: EventCopyExisting
  /** In English, for anything that shows the server's own words. */
  message: string
}

/** What copying an event into another environment answers with (KOE-1471). */
export interface EventCopyResult {
  eventId: string
  judges: EventCopyJudgeNotice[]
  target: string
}

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

/**
 * A trial whose fee can be read, in whatever state: what the secretary's entry lists read the payment
 * picture of (`getPaymentPicture`, KOE-1552). The event view shows only a confirmed trial.
 */
export type PricedDogEvent = DogEvent & MinimalEventForCost

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
