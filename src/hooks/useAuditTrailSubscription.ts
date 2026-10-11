import type { Dispatch, SetStateAction } from 'react'
import type { AuditRecord } from '../types'
import { useContext, useEffect } from 'react'
import { WebSocketContext } from './useWebSocket'

/** A row of the audit table is its auditKey and timestamp, the table's own key. */
export const auditRecordId = (record: AuditRecord) => `${record.auditKey}:${record.timestamp.toISOString()}`

export const mergeAuditTrail = (current: AuditRecord[], incoming: AuditRecord[]) => {
  const records = new Map(current.map((record) => [auditRecordId(record), record]))
  for (const record of incoming) records.set(auditRecordId(record), record)
  return [...records.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

export const useAuditTrailSubscription = (
  auditKey: string,
  enabled: boolean,
  setAuditTrail: Dispatch<SetStateAction<AuditRecord[]>>
) => {
  const subscribeAuditRecords = useContext(WebSocketContext)?.subscribeAuditRecords

  useEffect(() => {
    if (!enabled || !subscribeAuditRecords) return
    return subscribeAuditRecords((record) => {
      if (record.auditKey === auditKey) setAuditTrail((current) => mergeAuditTrail(current, [record]))
    })
  }, [auditKey, enabled, setAuditTrail, subscribeAuditRecords])
}
