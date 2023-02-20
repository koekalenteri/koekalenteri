import { DbRecord, Dog, JsonDbRecord, JsonDog, JsonTestResult, Language, Person, Replace, TestResult } from ".";

export interface JsonRegistration extends JsonDbRecord {
  agreeToPublish: boolean
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
  paid?: boolean
  cancelled?: boolean
  group?: JsonRegistrationGroup
}

export interface RegistrationGroup extends RegistrationDate { number: number, key: string }
export interface JsonRegistrationGroup extends JsonRegistrationDate { number: number, key: string }
export interface ManualTestResult extends QualifyingResult {
  id: string
  regNo: string
}

export interface Registration extends DbRecord {
  agreeToPublish: boolean
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
  paid?: boolean
  cancelled?: boolean
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
