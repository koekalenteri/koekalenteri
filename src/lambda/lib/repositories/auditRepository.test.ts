import type { JsonAuditRecord } from '../../../types'
import { vi } from 'vitest'

const mockQuery = vi.fn()
const mockWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { auditTable: 'audit-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    query = (...args: unknown[]) => mockQuery(...args)
    write = (...args: unknown[]) => mockWrite(...args)
  },
}))

const { readAuditTrail, writeAuditRecord } = await import('./auditRepository')

const record: JsonAuditRecord = {
  auditKey: 'event-1:registration-1',
  message: 'message',
  timestamp: '2026-10-19T08:00:00.000Z',
  user: 'user',
}

describe('auditRepository', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockWrite.mockReset()
  })

  it('opens its client on the audit table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('audit-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('writeAuditRecord stores the record as it is', async () => {
    mockWrite.mockResolvedValueOnce({})

    await writeAuditRecord(record)

    expect(mockWrite).toHaveBeenCalledWith(record)
  })

  it('writeAuditRecord rejects when the write fails', async () => {
    const error = new Error('DB error')
    mockWrite.mockRejectedValueOnce(error)

    await expect(writeAuditRecord(record)).rejects.toBe(error)
  })

  it('readAuditTrail queries the records under the audit key', async () => {
    mockQuery.mockResolvedValueOnce([record])

    await expect(readAuditTrail('event-1:registration-1')).resolves.toEqual([record])
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'auditKey = :auditKey',
      values: { ':auditKey': 'event-1:registration-1' },
    })
  })

  it('readAuditTrail returns no records when the query returns none', async () => {
    mockQuery.mockResolvedValueOnce(undefined)

    await expect(readAuditTrail('event:event-1')).resolves.toEqual([])
  })
})
