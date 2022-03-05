import { Dog, Person, TestResult } from ".";

export type Registration = {
  eventId: string
  class: string
  dates: RegistrationDate[]
  dog: Dog
  owner: RegistrationPerson
  handler: RegistrationPerson
  qualifyingResults: TestResult[]
  notes: string
  agreeToTerms: boolean
  agreeToPublish: boolean
}

export type RegistrationDate = {
  date: string | Date
  time: RegistrationTime
}

export type RegistrationTime = 'ap' | 'ip'

export type RegistrationPerson = Person & {
  membership: boolean
}
