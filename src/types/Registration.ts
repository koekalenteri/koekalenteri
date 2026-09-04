import type {
  DbRecord,
  Dog,
  EmailTemplateId,
  JsonDbRecord,
  JsonDog,
  JsonTestResult,
  Language,
  PatchOperation,
  Person,
  PublicJudge,
  Replace,
  TestResult,
} from '.'
import type { DogEventCostSegment } from './Cost'

export type RegistrationClass = 'ALO' | 'AVO' | 'VOI'
export type RegistrationTemplateContext = '' | 'cancel' | 'confirm' | 'receipt' | 'update' | 'invitation' | 'refund'

/**
 * Faults that zero a single task while the dog carries on (NOWT rules §5.7.3).
 *
 * Stored as a code, never as a label: the Finnish wording is an i18n key, and a rules revision must be
 * able to reword it without orphaning the recorded history.
 */
export type NowtZeroFault =
  | 'unauthorizedRun'
  | 'outOfControl'
  | 'persistentNoise'
  | 'abandonedRetrieve'
  | 'refusedWater'
  | 'dummyNotFound'
  | 'huntingWithDummy'
  | 'swappedDummy'
  | 'eyeWipe'

/**
 * The faults a judge ends a dog's trial on: NOWT's hylkäävät virheet (§5.3.5), NOME-A's (§3.3.3),
 * NOME-B's keskeytyssyyt (§4.3.3) and the taipumuskoe's failed qualities (§2.3.2), in the rules edition
 * in force from 15.4.2023. The round is voided, so every one of these resolves to a dash rather than a
 * zero, and this code is then the only place the reason survives.
 *
 * One code per rules bullet, shared across the lists where the bullets say the same thing. The union is
 * wider than any one list, and `eliminatingFaults` in `lib/results.ts` says which codes each event type
 * offers — the same act is an eliminating fault in one format and a task-zeroing `NowtZeroFault` in
 * another, so a code's presence here says nothing about where it applies.
 */
export type EliminatingFault =
  | 'aggression'
  | 'gunShyness'
  | 'excessiveShyness'
  /** Vinkuminen tai haukkuminen. NOME-B tolerates a single whine, its bullet reads "toistuva". */
  | 'noise'
  | 'refusedWater'
  | 'refusedRetrieve'
  /** Kieltäytyminen riistasta tai noudon jättäminen kesken. */
  | 'refusedGame'
  /** Riistan (NOWT: damin) vahingoittaminen. NOME-B and NOU count rolling on the game with it. */
  | 'hardMouth'
  /** Riistan vaihtaminen. NOME-B counts repeatedly dropping the game with it. */
  | 'swappedGame'
  | 'chasedUnshotGame'
  | 'huntingWithGame'
  | 'unauthorizedRun'
  | 'physicalContact'
  | 'outOfControl'
  /** Täysin riittämätön työskentelyhalu; in the taipumuskoe the Hakuinto quality failing for it. */
  | 'noDrive'
  /** Yhteistyö niin puutteellista, ettei kokeen suorittaminen onnistu. */
  | 'lacksCooperation'
  /** NOU's alone: an overexcited dog fails Sosiaalinen käyttäytyminen (§2.3.2). */
  | 'overExcitement'
  /** NOU's alone: a dog that dares not work out to the task's distance fails Itseluottamus (§2.3.2). */
  | 'lacksIndependence'
  /**
   * Scent-marking, and NOU's alone: §2.3.2 fails the Hakuinto quality for it as evidence of deficient
   * hunting drive, rather than treating it as bad manners. NOWT §5.3.5 does not list it.
   */
  | 'marking'
  /**
   * NOWT's alone: not in §5.3.5's list, but §5.4.1 names a trial stopped for disciplining the dog at the
   * venue beside the eliminating faults. The handler's own misconduct, landing on the same outcome.
   */
  | 'harshHandling'

/**
 * A round ended by a hylkäävä virhe (§5.7.2). Every one of these is a dash rather than a zero.
 *
 * The post is recorded because an elimination happens somewhere: which post a dog was thrown out at is
 * worth knowing, and it is lost the moment only the fault is kept.
 */
export interface EventResultElimination {
  fault: EliminatingFault
  /** Absent for event types with no posts. */
  stationId?: string
}

/** Why a round ended before it was scored. Only a handler's own withdrawal is conditional. */
export interface EventResultRetirement {
  /**
   * `judgeStopped` is the judge ending the dog's trial — in NOME-A on two serious faults, where an
   * eye-wipe or a first dog down does it alone (§3.3.3), and in NOME-B on the keskeytyssyyt of §4.3.3.
   * It is deliberately not an `EventResultElimination`: a stop is not itself a hylkäävä virhe, and
   * §4.3.3 asks for who stopped the trial as well as why. It publishes as a nought and a `ResultMark`
   * (KOE-1300); the reason is KOE-1299's to record.
   */
  cause: 'handlerChoice' | 'injury' | 'judgeStopped'
  /**
   * The judge's call, asked only for `handlerChoice`: §5.8.1 grants the dash where the dog could still
   * have placed, and a zero otherwise. An injured dog always takes the dash.
   */
  couldStillHavePlaced?: boolean
  /** Where it happened. An injury in particular is worth locating, not just counting. */
  stationId?: string
}

/**
 * A note published beside the result rather than in place of it — Koiranet's "Lisämerkinnät" (KOE-1300).
 *
 * The result line says how the dog placed, and a stopped trial takes the nought the rules give it — the
 * same nought a dog that simply failed to place takes. The mark is what distinguishes them, which is
 * why it rides alongside instead of replacing the code. Stored as a code, never as a label — the
 * Finnish wording is an i18n key.
 *
 * Derived from what is recorded, never entered: see `resultMarks` in `lib/results.ts`.
 */
export type ResultMark = 'interrupted'

/** One task's score for one dog. A task is identified by its post and its position within it. */
export interface JsonEventResultTask {
  stationId: string
  /** 0-based position among that post's tasks. */
  index: number
  /** `null` while unscored. `0` is a real score and bars every prize; it is not the same as unscored. */
  points: number | null
  /**
   * ALO only: the dog was called back mid-task, which halves what it can score there (§10.4). This caps
   * the entry, never the denominator — scoring against the reduced figure would erase the penalty.
   */
  recalled?: boolean
  /** The round stopped here. Recorded as a dash, which is not a zero and contributes nothing. */
  retired?: boolean
  /** Required whenever `points` is 0, so the reason survives into later statistics. */
  zeroFault?: NowtZeroFault
  judge?: PublicJudge
  updatedAt: string
  updatedBy: string
}

/**
 * Client-side shapes. `http` revives any ISO string into a `Date` by the value's own shape rather than
 * by field name, so `updatedAt` really is a `Date` once a result has crossed the wire — the same reason
 * `paidAt` and `refundAt` are mapped.
 */
type EventResultTask = Replace<JsonEventResultTask, 'updatedAt', Date>
export type EventResult = Replace<Omit<JsonEventResult, 'tasks'>, 'updatedAt', Date> & {
  tasks?: EventResultTask[]
}

/**
 * The outcome a secretary records for this event. Distinct from `results` (prior results the registrant
 * claims) and `qualifyingResults` (server-computed prior history) — both of those describe the dog's
 * past, not what it did here.
 */
export interface JsonEventResult {
  /** Per-task scores, for event types scored at posts (NOWT). */
  tasks?: JsonEventResultTask[]
  /** Derived server-side from `tasks`; a client-supplied total is ignored. */
  points?: number
  /** The round's nominal maximum — 80 or 100, depending on how many posts the event ran. */
  maxPoints?: number
  /** Derived. Absent for a voided round, which has nothing to compare against a complete one. */
  percentage?: number
  /** Composed as prefix + code, e.g. `ALO1`, `AVO-`, `NOU0`. */
  result?: string
  cert?: boolean
  resCert?: boolean
  elimination?: EventResultElimination
  retirement?: EventResultRetirement
  /** The judging judge, for event types that do not score at posts. */
  judge?: PublicJudge
  notes?: string
  updatedAt: string
  updatedBy: string
}

export interface JsonEmailDeliveryStatus {
  at: string
  email: string
  reason?: string
  status: 'bounce' | 'complaint'
  template?: EmailTemplateId
}

export interface JsonRegistration extends JsonDbRecord {
  agreeToTerms: boolean
  breeder: RegistrationBreeder
  cancelled?: boolean
  cancelReason?: string
  /** Secret client-generated key allowing only the original create retry to resume. */
  creationIdempotencyKey?: string
  class?: RegistrationClass | null
  /** registrant has comfirmed participation */
  confirmed?: boolean
  dates: JsonRegistrationDate[]
  dog: JsonDog
  eventId: string
  eventType: string
  /** Increment to revoke previously issued participant edit tokens. */
  editTokenVersion?: number
  /** Raw participant edit token. Only present in participant-facing API responses. */
  editToken?: string
  group?: JsonRegistrationGroup
  /**
   * The published start position, frozen when the class's start numbers are published (KOE-1017).
   * `group` stays the secretary's working order and is renumbered freely; this snapshot is the
   * public truth, and nothing automatic writes it — only publishing the class's numbers (which
   * rewrites it from the group as it stands) or the secretary's explicit number entry. The whole
   * placement is snapshotted rather than the bare number because a cancellation drops the group's
   * date and time, and the POISSA row still has to land under the right day.
   */
  startGroup?: JsonRegistrationGroup
  handler?: RegistrationPerson
  emailDeliveryStatus?: JsonEmailDeliveryStatus
  internalNotes?: string
  invitationAttachment?: string
  invitationAttachmentRead?: string
  invitationAttachmentSent?: string
  invitationAttachmentUpdatedAt?: string
  invitationRead?: boolean
  language: Language
  lastEmail?: string
  /** tracks which message templates have been sent to this registration */
  messagesSent?: Partial<Record<EmailTemplateId, boolean>>
  notes: string
  owner?: RegistrationPerson
  owners?: RegistrationOwner[]
  /** `true` = legacy single-owner record; a string is the `key` of the handling owner in `owners`. */
  ownerHandles?: boolean | string
  /** `true` = legacy single-owner record; a string is the `key` of the paying owner in `owners`. */
  ownerPays?: boolean | string
  optionalCosts?: number[]
  paidAmount?: number
  paidAt?: string
  payer?: Omit<RegistrationPerson, 'location' | 'membership'>
  paymentStatus?: PaymentStatus
  priorityByInvitation?: boolean
  qualifies?: boolean
  qualifyingResults: JsonQualifyingResult[]
  refundAmount?: number
  refundAt?: string
  refundHandlingCost?: number
  refundStatus?: PaymentStatus
  reserve: ReserveChoise | ''
  reserveNotified?: number | true // true is only found in old records
  results?: Array<JsonTestResult & { id: string }>
  /** The result recorded for THIS event by the secretary. See `JsonEventResult`. */
  eventResult?: JsonEventResult
  state?: 'creating' | 'ready'
  shouldPay?: boolean
  totalAmount?: number
  selectedCost?: DogEventCostSegment
  /** Durable, at-least-once completion markers for a newly created registration. */
  newRegistrationStatsAt?: string
  newRegistrationPublishedAt?: string
  newRegistrationAuditAt?: string
  newRegistrationEmailSentAt?: string
  newRegistrationProcessedAt?: string
  /** Short-lived owner token for serializing new-registration follow-up work. */
  newRegistrationLease?: { expiresAt: number; token: string }
}

export interface RegistrationGroup extends Partial<RegistrationDate> {
  number: number
  key: string
}
export interface JsonRegistrationGroup extends Partial<JsonRegistrationDate> {
  number: number
  key: string
}

/** The public row's group: the number is withheld until the class's start numbers are published. */
export type JsonPublicRegistrationGroup = Omit<JsonRegistrationGroup, 'number'> & { number?: number }
export type PublicRegistrationGroup = Omit<RegistrationGroup, 'number'> & { number?: number }

export type RegistrationGroupInfo = Pick<Registration, 'eventId' | 'id' | 'group' | 'cancelled' | 'cancelReason'>
export type JsonRegistrationGroupInfo = Pick<
  JsonRegistration,
  'eventId' | 'id' | 'group' | 'cancelled' | 'cancelReason'
>

/**
 * A placement instruction, expressed relative to a registration rather than a
 * client-calculated ordinal. This makes the instruction safe to replay after
 * another client has changed the same event.
 */
export type RegistrationGroupMove = {
  id: string
  group: {
    key: string
    date?: string | Date
    time?: RegistrationTime
  }
  /** Insert before this registration in the destination group; omit to append. */
  beforeId?: string
  cancelReason?: string
}

export interface ManualTestResult extends QualifyingResult {
  id: string
  regNo: string
  official: false
}

export interface Registration
  extends Omit<
      JsonRegistration,
      | 'dates'
      | 'dog'
      | 'eventResult'
      | 'invitationAttachmentUpdatedAt'
      | 'paidAt'
      | 'qualifyingResults'
      | 'refundAt'
      | 'results'
      | 'group'
      | 'startGroup'
      | keyof JsonDbRecord
    >,
    DbRecord {
  dates: RegistrationDate[]
  dog: Dog
  eventResult?: EventResult
  paidAt?: Date
  refundAt?: Date
  qualifyingResults: QualifyingResult[]
  results?: Array<ManualTestResult>
  group?: RegistrationGroup
  startGroup?: RegistrationGroup
  invitationAttachmentUpdatedAt?: Date
}

export type RegistrationCreateRequest = Omit<Registration, 'editToken'> & { editToken?: never }

export interface JsonRegistrationPatchRequest {
  eventId: string
  id: string
  modifiedAt?: string
  operations: PatchOperation[]
}

export interface RegistrationPatchRequest extends Omit<JsonRegistrationPatchRequest, 'modifiedAt'> {
  modifiedAt?: Date
}

export interface JsonPublicRegistration {
  class?: string | null
  cancelled?: boolean
  dog: JsonDog
  group: JsonPublicRegistrationGroup
  handler: string
  owner: string
  breeder: string
  /**
   * True when the sole owner named in `owner` also handles the dog, collapsing the row to
   * "owner & handler". With several owners it is `false` and `handler` names the handling person.
   */
  ownerHandles?: boolean
  /**
   * Preview only (KOE-1218): `true` while the number is still the derived working order, `false`
   * once it is an entered or frozen number of the dog's own. Absent on the public list, where every
   * visible number is published truth.
   */
  numberProvisional?: boolean
  /** Present only where the class's results have been published. Composed, e.g. `AVO1` or `ALO-`. */
  result?: string
  /**
   * Published with the result and only where it is: what the code alone cannot say, such as a trial the
   * judge stopped (KOE-1300). Absent rather than empty when there is nothing to add.
   */
  marks?: ResultMark[]
}

export interface PublicRegistration extends Omit<JsonPublicRegistration, 'dog' | 'group'> {
  dog: Dog
  group: PublicRegistrationGroup
}

export interface JsonQualifyingResult extends JsonTestResult {
  official: boolean
  qualifying?: boolean
}
export interface QualifyingResult extends TestResult {
  official: boolean
  qualifying?: boolean
  // for component
  id?: string
  // for manual results
  regNo?: string
  // for ranking
  rankingPoints?: number
}

export type QualifyingResults = {
  relevant: QualifyingResult[]
  qualifies: boolean
  minResultDate?: Date
  maxResultDate?: Date
}

export interface JsonRegistrationDate {
  date: string
  time?: RegistrationTime
}

export type RegistrationDate = Replace<JsonRegistrationDate, 'date', Date>

export type RegistrationTime = 'ap' | 'ip' | 'kp'

export interface RegistrationPerson extends Person {
  membership: boolean
}

export interface RegistrationOwner extends RegistrationPerson {
  /** Client-generated stable key, used to select this owner as handler/payer among multiple owners. */
  key: string
}

export type RegistrationBreeder = Omit<Person, 'email' | 'phone'>

export type ReserveChoise = 'ANY' | 'DAY' | 'WEEK' | 'NO'

export type PaymentStatus = 'SUCCESS' | 'CANCEL' | 'DUPLICATE' | 'PENDING' | 'NEW'

export interface MinimalRegistrationForMembership {
  handler?: Pick<RegistrationPerson, 'membership'>
  owner?: Pick<RegistrationPerson, 'membership'>
  owners?: Pick<RegistrationPerson, 'membership'>[]
  ownerHandles?: boolean | string
}
