import type { DbRecord, Dog, JsonDbRecord, JsonDog, JsonTestResult, Language, Person, Replace, TestResult } from '.'

export type RegistrationClass = 'ALO' | 'AVO' | 'VOI'
export interface JsonRegistration extends JsonDbRecord {
  agreeToTerms: boolean
  breeder: RegistrationBreeder
  class?: RegistrationClass
  dates: JsonRegistrationDate[]
  dog: JsonDog
  eventId: string
  eventType: string
  handler: RegistrationPerson
  language: Language
  notes: string
  owner: RegistrationPerson
  ownerHandles?: boolean
  qualifyingResults: JsonQualifyingResult[]
  reserve: ReserveChoise | ''
  results?: Array<JsonTestResult & { id: string }>
  cancelled?: boolean
  cancelReason?: string
  confirmed?: boolean
  invitationRead?: boolean
  receiptSent?: boolean
  paidAmount?: number
  paidAt?: string
  paymentStatus?: PaymentStatus
  group?: JsonRegistrationGroup
  priorityByInvitation?: boolean
  lastEmail?: string
  reserveNotified?: boolean
  totalAmount?: number
}

export interface RegistrationGroup extends Partial<RegistrationDate> {
  number: number
  key: string
}
export interface JsonRegistrationGroup extends Partial<JsonRegistrationDate> {
  number: number
  key: string
}

export interface RegistrationGroupInfo extends Pick<Registration, 'eventId' | 'id' | 'group' | 'cancelled'> {}
export interface JsonRegistrationGroupInfo extends Pick<JsonRegistration, 'eventId' | 'id' | 'group' | 'cancelled'> {}

export interface ManualTestResult extends QualifyingResult {
  id: string
  regNo: string
}

export interface Registration
  extends Omit<
      JsonRegistration,
      'dates' | 'dog' | 'paidAt' | 'qualifyingResults' | 'results' | 'group' | keyof JsonDbRecord
    >,
    DbRecord {
  dates: RegistrationDate[]
  dog: Dog
  paidAt?: Date
  qualifyingResults: QualifyingResult[]
  results?: Array<ManualTestResult>
  group?: RegistrationGroup
}

export interface JsonRegistrationWithGroup extends JsonRegistration {
  group: JsonRegistrationGroup
}

export interface JsonPublicRegistration {
  class?: string
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
}

export interface JsonRegistrationDate {
  date: string
  time?: RegistrationTime
}

export interface RegistrationDate extends Replace<JsonRegistrationDate, 'date', Date> {}

export type RegistrationTime = 'ap' | 'ip' | 'kp'

export interface RegistrationPerson extends Person {
  membership: boolean
}

export interface RegistrationBreeder extends Omit<Person, 'email' | 'phone'> {}

export type ReserveChoise = 'ANY' | 'DAY' | 'WEEK' | 'NO'

export type PaymentStatus = 'SUCCESS' | 'CANCEL' | 'PENDING'
