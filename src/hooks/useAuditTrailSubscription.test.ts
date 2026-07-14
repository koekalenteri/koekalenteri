import type { AuditRecord } from '../types'
import { mergeAuditTrail } from './useAuditTrailSubscription'

const record = (timestamp: string, message: string): AuditRecord => ({
  auditKey: 'event:event-1',
  message,
  timestamp: new Date(timestamp),
  user: 'admin',
})

describe('mergeAuditTrail', () => {
  it('merges, orders, and deduplicates audit records', () => {
    const newer = record('2026-07-14T12:01:00.000Z', 'newer')
    const older = record('2026-07-14T12:00:00.000Z', 'older')

    expect(mergeAuditTrail([newer], [older, newer])).toEqual([older, newer])
  })
})
