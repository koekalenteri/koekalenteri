import type {
  DbRecord,
  Dog,
  EmailTemplateId,
  JsonDbRecord,
  JsonDog,
  JsonTestResult,
  Language,
  Person,
  Replace,
  TestResult,
} from '.'
import type { DogEventCostSegment } from './Cost'

export type RegistrationClass = 'ALO' | 'AVO' | 'VOI'
export type RegistrationTemplateContext = '' | 'cancel' | 'confirm' | 'receipt' | 'update' | 'invitation' | 'refund'

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
  invitationAttachmentSent?: string
  invitationRead?: boolean
  language: Language
  lastEmail?: string
  /** tracks which message templates have been sent to this registration */
  messagesSent?: Partial<Record<EmailTemplateId, boolean>>
  notes: string
  owner?: RegistrationPerson
  ownerHandles?: boolean
  ownerPays?: boolean
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
      'dates' | 'dog' | 'paidAt' | 'qualifyingResults' | 'refundAt' | 'results' | 'group' | keyof JsonDbRecord
    >,
    DbRecord {
  dates: RegistrationDate[]
  dog: Dog
  paidAt?: Date
  refundAt?: Date
  qualifyingResults: QualifyingResult[]
  results?: Array<ManualTestResult>
  group?: RegistrationGroup
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

export type RegistrationBreeder = Omit<Person, 'email' | 'phone'>

export type ReserveChoise = 'ANY' | 'DAY' | 'WEEK' | 'NO'

export type PaymentStatus = 'SUCCESS' | 'CANCEL' | 'DUPLICATE' | 'PENDING' | 'NEW'

export interface MinimalRegistrationForMembership {
  handler?: Pick<RegistrationPerson, 'membership'>
  owner?: Pick<RegistrationPerson, 'membership'>
  ownerHandles?: Registration['ownerHandles']
}
