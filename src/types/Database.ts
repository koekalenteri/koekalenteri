export interface JsonDbRecord {
  id: string
  createdAt: string
  createdBy: string
  deletedAt?: string
  deletedBy?: string
  modifiedAt: string
  modifiedBy: string
  updatedAt?: string
}

type AuditMessageParam = string | number | boolean

export interface DbRecord extends Omit<JsonDbRecord, 'createdAt' | 'modifiedAt' | 'deletedAt' | 'updatedAt'> {
  createdAt: Date
  modifiedAt: Date
  deletedAt?: Date
  updatedAt?: Date
}

/**
 * Where an audit row's `user` came from when it is not an authenticated user: `registration` means
 * the name was taken from the registration's own people (the payer, the handler or an owner), as
 * the public registration routes have no login to name. Absent for an authenticated user or the
 * system.
 */
export type AuditUserSource = 'registration'

export interface JsonAuditRecord {
  auditKey: string
  changes?: JsonAuditChange[]
  details?: JsonAuditDetail[]
  messageKey?: string
  messageParams?: Record<string, AuditMessageParam>
  timestamp: string
  user: string
  userSource?: AuditUserSource
  /** The Finnish text of a row written before the keys (KOE-1442); a new row has only its key (KOE-1511). */
  message?: string
}

export interface AuditRecord extends Omit<JsonAuditRecord, 'timestamp' | 'messageParams'> {
  /** As the API's JSON reviver leaves them: a parameter written as a bare yyyy-MM-dd arrives as a Date. */
  messageParams?: Record<string, AuditMessageParam | Date>
  timestamp: Date
}

export interface JsonAuditChangeValue {
  state?: 'empty' | 'removed'
  text?: string
}

export interface JsonAuditChange {
  field: string
  labelKey?: string
  labelParams?: Record<string, string | number | boolean>
  next: JsonAuditChangeValue
  previous: JsonAuditChangeValue
}

export interface JsonAuditDetail {
  detailKey: string
  detailParams?: Record<string, string | number | boolean>
}
