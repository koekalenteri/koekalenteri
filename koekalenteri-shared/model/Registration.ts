import { Dog, JsonDog, Language, Person, Replace, TestResult } from ".";

export type JsonRegistration = {
  agreeToPublish: boolean
  agreeToTerms: boolean
  breeder: RegistrationBreeder
  class: string
  dates: JsonRegistrationDate[]
  dog: JsonDog
  eventId: string
  eventType: string
  handler: RegistrationPerson
  id?: string
  language: Language
  notes: string
  owner: RegistrationPerson
  qualifyingResults: TestResult[]
  reserve: ReserveChoise | ''
}

export type Registration = Replace<Replace<JsonRegistration, 'dates', RegistrationDate[]>, 'dog', Dog>

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
