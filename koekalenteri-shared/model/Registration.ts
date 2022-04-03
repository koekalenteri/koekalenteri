import { DbRecord, Dog, JsonDbRecord, JsonDog, JsonTestResult, Language, Person, Replace, TestResult } from ".";

export type JsonRegistration = JsonDbRecord & {
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
  results?: JsonTestResult[]
}

export type Registration = DbRecord & {
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
  results?: TestResult[]
}

export type JsonQualifyingResult = JsonTestResult & { official: boolean, qualifying?: boolean };
export type QualifyingResult = TestResult & { official: boolean, qualifying?: boolean };

export type JsonRegistrationDate = {
  date: string
  time: RegistrationTime
}

export type RegistrationDate = Replace<JsonRegistrationDate, 'date', Date>

export type RegistrationTime = 'ap' | 'ip'

export type RegistrationPerson = Person & {
  membership: boolean
}

export type RegistrationBreeder = Omit<Person, 'email' | 'phone'>;

export type ReserveChoise = 'ANY' | 'DAY' | 'WEEK' | 'NO'
