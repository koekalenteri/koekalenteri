export type Person = {
  name: string
  email: string
  phone: string
  location: string
}

export type OfficialPerson = Person & {
  id: number
}

export type Secretary = OfficialPerson;

export type Official = OfficialPerson & {
  eventTypes: string[]
}

export type Judge = OfficialPerson & {
  languages: string[]
  eventTypes: string[]
  district: string
}
