import { DbRecord, JsonDbRecord } from "./Database"

export interface Person {
  name: string
  email: string
  phone?: string
  location?: string
}

export interface OfficialPerson extends Person {
  id: number
}

export interface Secretary extends Person {
  id: number | string
 }

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

export interface User extends Person, Partial<DbRecord> {
  id: string
  kcId?: number
  judge?: boolean
  officer?: boolean
  roles?: UserRoles
  admin?: boolean
}

export type JsonUser = Omit<User, keyof DbRecord> & JsonDbRecord

export interface UserRoles {
  [organizer: string]: UserRole
}

export type UserRole = 'admin' | 'secretary'
