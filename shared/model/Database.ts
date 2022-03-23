import { Replace, ReplaceOptional } from ".";

export type JsonDbRecord = {
  id: string
  createdAt: string
  createdBy: string
  deletedAt?: string
  deletedBy?: string
  modifiedAt: string
  modifiedBy: string
}

export type DbRecord = ReplaceOptional<Replace<JsonDbRecord, 'createdAt' | 'modifiedAt', Date>, 'deletedAt', Date>
