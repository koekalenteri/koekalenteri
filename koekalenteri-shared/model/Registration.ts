import { DbRecord, Dog, JsonDbRecord, JsonDog, JsonTestResult, Language, Person, Replace, TestResult } from ".";

export interface JsonRegistration extends JsonDbRecord {
  agreeToTerms: boolean
  breeder: RegistrationBreeder
  class?: string
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
  receiptSent?: boolean
  paidAt?: Date
  paymentStatus?: PaymentStatus
  group?: JsonRegistrationGroup
}

export interface RegistrationGroup extends Partial<RegistrationDate> { number: number, key: string }
export interface JsonRegistrationGroup extends Partial<JsonRegistrationDate> { number: number, key: string }

export interface RegistrationGroupInfo extends Pick<Registration, 'eventId' | 'id' | 'group' | 'cancelled'> {}
export interface JsonRegistrationGroupInfo extends Pick<JsonRegistration, 'eventId' | 'id' | 'group' | 'cancelled'> {}

export interface ManualTestResult extends QualifyingResult {
  id: string
  regNo: string
}

export interface Registration extends DbRecord {
  agreeToTerms: boolean
  breeder: RegistrationBreeder
  class?: string
  dates: RegistrationDate[]
  dog: Dog
  eventId: string
  eventType: string
  handler: RegistrationPerson
  language: Language
  notes: string
  owner: RegistrationPerson
  ownerHandles?: boolean
  qualifyingResults: QualifyingResult[]
  reserve: ReserveChoise | ''
  results?: Array<ManualTestResult>
  cancelled?: boolean
  receiptSent?: boolean
  paidAt?: Date
  paymentStatus?: PaymentStatus
  cancelReason?: string
  group?: RegistrationGroup
}

export interface JsonQualifyingResult extends JsonTestResult { official: boolean, qualifying?: boolean };
export interface QualifyingResult extends TestResult { official: boolean, qualifying?: boolean };

export interface JsonRegistrationDate {
  date: string
  time?: RegistrationTime
}

export interface RegistrationDate extends Replace<JsonRegistrationDate, 'date', Date> { }

export type RegistrationTime = 'ap' | 'ip'

export interface RegistrationPerson extends Person {
  membership: boolean
}

export interface RegistrationBreeder extends Omit<Person, 'email' | 'phone'> { }

export type ReserveChoise = 'ANY' | 'DAY' | 'WEEK' | 'NO'

export type PaymentStatus = 'SUCCESS' | 'CANCEL' | 'PENDING'
