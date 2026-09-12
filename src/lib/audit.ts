import type { AuditUserSource, JsonAuditRecord } from '../types'

/**
 * Whom an audit row is attributed to. An authenticated user has no `source`; a name taken from the
 * registration's own people says so, and the trail shows the difference.
 */
export interface AuditActor {
  name: string
  source?: AuditUserSource
}

/** The `user` fields of an audit row (or a transaction) for the actor, for spreading into the record. */
export const auditUser = (actor: AuditActor): Pick<JsonAuditRecord, 'user' | 'userSource'> => ({
  user: actor.name,
  ...(actor.source ? { userSource: actor.source } : {}),
})
