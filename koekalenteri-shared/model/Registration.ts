import { Dog, JsonDog, Person, Replace, TestResult } from ".";

export type JsonRegistration = {
  eventId: string
  id?: string
  eventType: string
  class: string
  dates: JsonRegistrationDate[]
  dog: JsonDog
  breeder: Omit<Person, 'email'|'phone'>
  owner: RegistrationPerson
  handler: RegistrationPerson
  qualifyingResults: TestResult[]
  notes: string
  reserve: ReserveChoise | ''
  agreeToTerms: boolean
  agreeToPublish: boolean
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

export type ReserveChoise = 'ANY' | 'DAY' | 'WEEK' | 'NO'
