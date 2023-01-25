export interface Person {
  name: string
  email: string
  phone: string
  location: string
}

export interface OfficialPerson extends Person {
  id: number
}

export interface Secretary extends OfficialPerson { }

export interface Official extends OfficialPerson {
  district: string
  eventTypes: string[]
}

export interface Judge extends OfficialPerson {
  district: string
  eventTypes: string[]
  languages: string[]
  active?: boolean
  official?: boolean
}
