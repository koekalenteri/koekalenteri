import { DbRecord, Dog, JsonDbRecord, JsonDog, JsonTestResult, Language, Person, Replace, TestResult } from ".";

export type JsonRegistration = JsonDbRecord & {
  agreeToPublish: boolean
  agreeToTerms: boolean
  breeder: RegistrationBreeder
  class: string
  dates: JsonRegistrationDate[]
  dog: JsonDog
  eventId: string
  eventType: string
  handler: RegistrationPerson
  language: Language
  notes: string
  owner: RegistrationPerson
  ownerHandles?: boolean
  qualifyingResults: JsonTestResult[]
  reserve: ReserveChoise | ''
}

export type QualifyingResult = TestResult & { qualifying?: boolean };
export type Registration = DbRecord & Replace<Replace<Replace<Omit<JsonRegistration, keyof JsonDbRecord>, 'dates', RegistrationDate[]>, 'dog', Dog>, 'qualifyingResults', QualifyingResult[]>

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
