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
  /**
   * A NOWT judge the judges' committee has named to judge Mock trials on their own (KOE-1357).
   * Kept by an admin; the Kennel Club sync does not know it. A-trial judges need no flag: they
   * judge Mock trials by right.
   */
  mockTrial?: boolean
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

export interface DataVersion {
  /** Opaque token, reminted whenever the collection changes. Compare for equality, nothing else. */
  revision: string
  modifiedAt?: string
}

export interface DataVersions {
  emailTemplates: DataVersion
  eventTypes: DataVersion
  judges: DataVersion
  locations: DataVersion
  officials: DataVersion
  organizers: DataVersion
  users: DataVersion
}

export interface User extends Person, Partial<DbRecord> {
  id: string
  kcId?: number
  kcEmail?: string
  judge?: string[]
  officer?: string[]
  roles?: UserRoles
  admin?: boolean
  dataVersions?: DataVersions
  lastSeen?: Date
  emailHistory?: { email: string; changedAt: string; source: 'kl' | 'login' }[]
}

export interface UserWithRoles extends User {
  roles: UserRoles
}

export type JsonUser = Omit<User, keyof DbRecord | 'lastSeen'> & JsonDbRecord & { lastSeen?: string }

export type UserRole = 'admin' | 'secretary'
