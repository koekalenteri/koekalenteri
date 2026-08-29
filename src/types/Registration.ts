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
 * Eliminating faults ("hylkäävä virhe", §5.7.2). The pair is barred from continuing and the round is
 * voided, so every one of these resolves to a dash rather than a zero. `harshHandling` is the handler's
 * own misconduct but the rules put it in the same category and it lands on the same outcome.
 *
 * Since the result is a uniform dash, this code is the only place the reason survives.
 */
export type NowtEliminatingFault = 'aggression' | 'gunShyness' | 'refusedRetrieve' | 'hardMouth' | 'harshHandling'

/** Why a round ended before it was scored. Only a handler's own withdrawal is conditional. */
export interface EventResultRetirement {
  cause: 'handlerChoice' | 'injury'
  /**
   * The judge's call, asked only for `handlerChoice`: §5.8.1 grants the dash where the dog could still
   * have placed, and a zero otherwise. An injured dog always takes the dash.
   */
  couldStillHavePlaced?: boolean
}

/** One task's score for one dog. */
export interface JsonEventResultTask {
  taskId: string
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
  eliminatedBy?: NowtEliminatingFault
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
      | 'invitationAttachmentUpdatedAt'
      | 'paidAt'
      | 'qualifyingResults'
      | 'refundAt'
      | 'results'
      | 'group'
      | keyof JsonDbRecord
    >,
    DbRecord {
  dates: RegistrationDate[]
  dog: Dog
  paidAt?: Date
  refundAt?: Date
  qualifyingResults: QualifyingResult[]
  results?: Array<ManualTestResult>
  group?: RegistrationGroup
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

export interface JsonRegistrationWithGroup extends JsonRegistration {
  group: JsonRegistrationGroup
}

export interface JsonPublicRegistration {
  class?: string | null
  cancelled?: boolean
  dog: JsonDog
  group: JsonRegistrationGroup
  handler: string
  owner: string
  breeder: string
  /**
   * True when the sole owner named in `owner` also handles the dog, collapsing the row to
   * "owner & handler". With several owners it is `false` and `handler` names the handling person.
   */
  ownerHandles?: boolean
}

export interface PublicRegistration extends Omit<JsonPublicRegistration, 'dog' | 'group'> {
  dog: Dog
  group: RegistrationGroup
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
