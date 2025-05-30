import type { CountryCode } from './countries'
import type { DbRecord, JsonDbRecord } from './Database'

interface PublicPerson {
  id?: number | string
  name: string
}

export interface Person extends PublicPerson {
  name: string
  email: string
  phone?: string
  location?: string
}

interface OfficialPerson extends Omit<Person, 'id'> {
  id: number
}

export interface Official extends OfficialPerson {
  district: string
  eventTypes: string[]
}

export type JsonOfficial = Omit<Official, keyof DbRecord> & Omit<JsonDbRecord, 'id'> & { id: number }

export interface Judge extends OfficialPerson {
  district: string
  eventTypes: string[]
  languages: string[]
  active?: boolean
  official?: boolean
}

export type JsonJudge = Omit<Judge, keyof DbRecord> & Omit<JsonDbRecord, 'id'> & { id: number }

export interface PublicJudge extends Omit<PublicPerson, 'id'> {
  id?: number
  country?: CountryCode
  official?: boolean
  foreing?: boolean
}

interface UserRoles {
  [organizer: string]: UserRole
}

export interface User extends Person, Partial<DbRecord> {
  id: string
  kcId?: number
  judge?: string[]
  officer?: string[]
  roles?: UserRoles
  admin?: boolean
  lastSeen?: Date
}

export interface UserWithRoles extends User {
  roles: UserRoles
}

export type JsonUser = Omit<User, keyof DbRecord | 'lastSeen'> & JsonDbRecord & { lastSeen?: string }

export type UserRole = 'admin' | 'secretary'
