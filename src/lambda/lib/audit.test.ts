import type { AuditRecord, JsonAuditRecord } from '../../types'

import { jest } from '@jest/globals'

const mockQuery = jest.fn<any>()
const mockWrite = jest.fn<any>()
jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    query: mockQuery,
    write: mockWrite,
  })),
}))

process.env.AUDIT_TABLE_NAME = 'audit-table-name'

const { registrationAuditKey, audit, auditTrail } = await import('./audit')

describe('audit', () => {
  afterEach(() => jest.clearAllMocks())

  describe('registrationAuditKey', () => {
    it('combines eventId and registration id', () => {
      expect(registrationAuditKey({ eventId: 'event-id', id: 'registration-id' })).toEqual('event-id:registration-id')
    })
  })

  describe('audit', () => {
    it('writes to database', async () => {
      const record: Omit<AuditRecord, 'timestamp'> = { auditKey: 'key', user: 'user', message: 'message' }

      await audit(record)

      expect(mockWrite).toHaveBeenCalledWith(
        expect.objectContaining({ ...record, timestamp: expect.any(String) }),
        'audit-table-name'
      )
      expect(mockWrite).toHaveBeenCalledTimes(1)
    })

    it('logs database error to console', async () => {
      const error = new Error('DB error')
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

      mockWrite.mockRejectedValueOnce(error)

      await audit({ auditKey: 'key', user: 'user', message: 'msg' })

      expect(errorSpy).toHaveBeenCalledWith(error)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('auditTrail', () => {
    it('returns items from database', async () => {
      const records: JsonAuditRecord[] = [
        { timestamp: '2021-01-01T00:00:00Z', auditKey: 'key', user: 'user', message: 'message' },
      ]

      mockQuery.mockResolvedValueOnce(records)

      const res = await auditTrail('key')

      expect(res).toBe(records)
    })

    it('returns empty array if no records are found', async () => {
      mockQuery.mockResolvedValueOnce(undefined)

      const res = await auditTrail('key')

      expect(res).toStrictEqual([])
    })

    it('logs database error to console and returns empty array', async () => {
      const error = new Error('DB error')
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

      mockQuery.mockRejectedValueOnce(error)

      const res = await auditTrail('key')

      expect(res).toStrictEqual([])
      expect(errorSpy).toHaveBeenCalledWith(error)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })
})
