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

export interface DbRecord extends Omit<JsonDbRecord, 'createdAt' | 'modifiedAt' | 'deletedAt' | 'updatedAt'> {
  createdAt: Date
  modifiedAt: Date
  deletedAt?: Date
  updatedAt?: Date
}

export interface JsonAuditRecord {
  auditKey: string
  changes?: JsonAuditChange[]
  details?: JsonAuditDetail[]
  messageKey?: string
  messageParams?: Record<string, string | number | boolean>
  timestamp: string
  user: string
  message: string
}

export interface AuditRecord extends Omit<JsonAuditRecord, 'timestamp'> {
  timestamp: Date
}

export interface JsonAuditChangeValue {
  state?: 'empty' | 'removed'
  text?: string
}

export interface JsonAuditChange {
  field: string
  labelKey?: string
  next: JsonAuditChangeValue
  previous: JsonAuditChangeValue
}

export interface JsonAuditDetail {
  detailKey: string
  detailParams?: Record<string, string | number | boolean>
}
