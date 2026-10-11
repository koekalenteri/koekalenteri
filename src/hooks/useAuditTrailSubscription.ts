import type { Dispatch, SetStateAction } from 'react'
import type { AuditRecord } from '../types'
import { useContext, useEffect } from 'react'
import { mergeAuditTrail } from '../lib/audit'
import { WebSocketContext } from './useWebSocket'

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
