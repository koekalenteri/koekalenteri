export interface JsonDbRecord {
  id: string
  createdAt: string
  createdBy: string
  deletedAt?: string
  deletedBy?: string
  modifiedAt: string
  modifiedBy: string
}

export interface DbRecord extends Omit<JsonDbRecord, 'createdAt' | 'modifiedAt' | 'deletedAt'> {
  createdAt: Date,
  modifiedAt: Date,
  deletedAt?: Date,
}

export interface JsonAuditRecord {
  auditKey: string
  timestamp: string
  user: string
  message: string
}

export interface AuditRecord extends Omit<JsonAuditRecord, 'timestamp'> {
  timestamp: Date
}
