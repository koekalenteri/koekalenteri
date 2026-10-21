import type { JsonAuditRecord } from '../../../types'
import { broadcast } from './broadcast'
import { removeConnection } from './connectionRepository'
import { eventSubscriberAudience } from './connectionSelectors'
import { bestEffort } from './livePush'

const getAuditEventId = (auditKey: string) => {
  const [prefix, id] = auditKey.split(':', 2)
  return prefix === 'event' ? id : prefix
}

/** A newly written audit record to the admins watching its event. Best effort: never rejects. */
export const publishAuditRecord = (record: JsonAuditRecord) => {
  const eventId = getAuditEventId(record.auditKey)
  if (!eventId) return Promise.resolve()

  return bestEffort('audit record', () =>
    broadcast({
      audience: () => eventSubscriberAudience(eventId),
      buildPayload: () => ({ eventId, record, scope: 'admin:audit-record' }),
      onGoneConnection: removeConnection,
    })
  )
}
