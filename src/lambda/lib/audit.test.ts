import type { AuditRecord, JsonAuditRecord, JsonConfirmedEvent } from '../../types'
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

const { eventAuditKey, registrationAuditKey, getEventAuditMessages, audit, auditTrail } = await import('./audit')

describe('audit', () => {
  afterEach(() => jest.clearAllMocks())

  describe('registrationAuditKey', () => {
    it('combines eventId and registration id', () => {
      expect(registrationAuditKey({ eventId: 'event-id', id: 'registration-id' })).toEqual('event-id:registration-id')
    })
  })

  describe('eventAuditKey', () => {
    it('prefixes event id', () => {
      expect(eventAuditKey({ id: 'event-id' })).toEqual('event:event-id')
    })
  })

  describe('getEventAuditMessages', () => {
    const event: JsonConfirmedEvent = {
      classes: [],
      cost: 0,
      createdAt: '',
      createdBy: '',
      description: '',
      endDate: '',
      entryEndDate: '',
      entryStartDate: '',
      eventType: '',
      id: 'event-id',
      judges: [],
      location: '',
      modifiedAt: '',
      modifiedBy: '',
      name: '',
      official: {},
      organizer: { id: 'org-id', name: 'Org' },
      places: 0,
      secretary: {},
      startDate: '',
      state: 'confirmed',
    }

    it('stores event field translation keys for generic changes', () => {
      const messages = getEventAuditMessages(event, { eventType: 'NOME-B', id: 'event-id' })

      expect(messages).toEqual([
        {
          changes: [
            {
              field: 'eventType',
              labelKey: 'event.eventType',
              next: { text: 'NOME-B' },
              previous: { state: 'empty' },
            },
          ],
          message: 'Muutti: eventType',
          messageKey: 'audit.changed',
        },
      ])
    })

    it('preserves omitted class start-list states when auditing partial class publish patches', () => {
      const messages = getEventAuditMessages(
        {
          ...event,
          classes: [
            { class: 'ALO', date: '' },
            { class: 'AVO', date: '' },
          ],
          startListPublished: { ALO: false, AVO: true },
        },
        { id: 'event-id', startListPublished: { ALO: true } }
      )

      expect(messages).toEqual([
        {
          message: 'ALO starttilista julkaistu',
          messageKey: 'audit.messages.classStartListPublished',
          messageParams: { eventClass: 'ALO' },
        },
      ])
    })
  })

  describe('audit', () => {
    it('writes to database', async () => {
      const record: Omit<AuditRecord, 'timestamp'> = { auditKey: 'key', message: 'message', user: 'user' }

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

      await audit({ auditKey: 'key', message: 'msg', user: 'user' })

      expect(errorSpy).toHaveBeenCalledWith(error)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('auditTrail', () => {
    it('returns items from database', async () => {
      const records: JsonAuditRecord[] = [
        { auditKey: 'key', message: 'message', timestamp: '2021-01-01T00:00:00Z', user: 'user' },
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
