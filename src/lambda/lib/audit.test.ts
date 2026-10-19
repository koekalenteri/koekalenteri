import type { JsonAuditRecord, JsonConfirmedEvent } from '../../types'
import { vi } from 'vitest'
import { legacyDayValue } from '../../test-utils/finnishDays'
import { loggedLines } from '../test-utils/logs'

const mockReadAuditTrail = vi.fn()
const mockWriteAuditRecord = vi.fn()
const mockPublishAuditRecord = vi.fn()
vi.doMock('./repositories/auditRepository', () => ({
  readAuditTrail: mockReadAuditTrail,
  writeAuditRecord: mockWriteAuditRecord,
}))
vi.doMock('./ws/auditPublisher', () => ({ publishAuditRecord: mockPublishAuditRecord }))

const { eventAuditKey, registrationAuditKey, getEventAuditMessages, audit, auditStrict, auditTrail } = await import(
  './audit'
)

describe('audit', () => {
  afterEach(() => vi.clearAllMocks())

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
      endDate: legacyDayValue(''),
      entryEndDate: legacyDayValue(''),
      entryStartDate: legacyDayValue(''),
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
      startDate: legacyDayValue(''),
      state: 'confirmed',
    }

    it('says nothing of a stale state of the Kennelliitto trial riding a save: it is read, not edited (KOE-1140)', () => {
      const stored = { ...event, kcState: { code: 1253, name: 'x', readAt: '2026-09-26T10:00:00.000Z' } }

      const messages = getEventAuditMessages(stored, {
        id: 'event-id',
        kcState: { code: 754, name: 'Hyväksytty', readAt: '2026-09-26T09:00:00.000Z' },
        name: 'Uusi nimi',
      })

      expect(messages).toHaveLength(1)
      expect(messages[0].changes?.map((change) => change.field)).toEqual(['name'])
    })

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
          messageKey: 'audit.changed',
        },
      ])
    })

    it('preserves omitted class start-list states when auditing partial class publish patches', () => {
      const messages = getEventAuditMessages(
        {
          ...event,
          classes: [
            { class: 'ALO', date: legacyDayValue('') },
            { class: 'AVO', date: legacyDayValue('') },
          ],
          startListPublished: { ALO: false, AVO: true },
        },
        { id: 'event-id', startListPublished: { ALO: true } }
      )

      expect(messages).toEqual([
        {
          messageKey: 'audit.messages.classStartListPublished',
          messageParams: { eventClass: 'ALO' },
        },
      ])
    })

    it.each([
      { expected: 'audit.messages.startListPublished', state: 'picked' as const },
      { expected: 'audit.messages.eventSaved', state: 'invited' as const },
    ])('records the first publish of an absent flag on a past $state trial as $expected', ({ expected, state }) => {
      // No flag reads as published only where the workflow invited (KOE-1465).
      const past = { ...event, endDate: '2025-03-01' as const, startDate: '2025-03-01' as const, state }
      const messages = getEventAuditMessages(past, { id: 'event-id', startListPublished: true })

      expect(messages).toEqual([{ messageKey: expected }])
    })

    it('records class place changes without derived or no-op fields', () => {
      const existing = {
        ...event,
        classes: [{ class: 'VOI' as const, date: legacyDayValue('2026-09-18T21:00:00.000Z'), places: 5 }],
        places: 5,
      }

      const messages = getEventAuditMessages(existing, {
        classes: [{ class: 'VOI', date: legacyDayValue('2026-09-18T21:00:00.000Z'), places: 6 }],
        id: event.id,
        places: 6,
        placesPerDay: null,
      })

      expect(messages).toEqual([
        {
          changes: [
            {
              field: 'classes.0.places',
              labelKey: 'audit.fields.classPlaces',
              labelParams: {
                eventClass: 'VOI',
                eventDate: '2026-09-18T21:00:00.000Z',
              },
              next: { text: '6' },
              previous: { text: '5' },
            },
          ],
          messageKey: 'audit.changed',
        },
      ])
    })

    it('writes a created or deleted event by its key alone (KOE-1511)', () => {
      expect(getEventAuditMessages(undefined, { id: event.id })).toEqual([
        { messageKey: 'audit.messages.eventCreated' },
      ])
      expect(getEventAuditMessages(event, { deletedAt: '2026-10-11T10:00:00.000Z', id: event.id })).toEqual([
        { messageKey: 'audit.messages.eventDeleted' },
      ])
    })

    it('omits patch fields that do not change the stored event', () => {
      expect(getEventAuditMessages(event, { id: event.id, placesPerDay: null })).toEqual([
        { messageKey: 'audit.messages.eventSaved' },
      ])
    })
  })

  describe('audit', () => {
    it('writes to database', async () => {
      const record: Omit<JsonAuditRecord, 'timestamp'> = { auditKey: 'key', message: 'message', user: 'user' }

      await audit(record)

      expect(mockWriteAuditRecord).toHaveBeenCalledWith({ ...record, timestamp: expect.any(String) })
      expect(mockWriteAuditRecord).toHaveBeenCalledTimes(1)
      expect(mockPublishAuditRecord).toHaveBeenCalledWith(expect.objectContaining(record))
    })

    it('logs database error to console', async () => {
      const error = new Error('DB error')
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      mockWriteAuditRecord.mockRejectedValueOnce(error)

      await audit({ auditKey: 'key', message: 'msg', user: 'user' })

      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({
          auditKey: 'key',
          error: expect.objectContaining({ message: 'DB error' }),
          message: 'failed to write audit record',
        }),
      ])
      expect(mockPublishAuditRecord).not.toHaveBeenCalled()
    })
  })

  describe('auditStrict', () => {
    const record: Omit<JsonAuditRecord, 'timestamp'> = { auditKey: 'key', message: 'message', user: 'user' }

    it('writes the record under the effect id and publishes it', async () => {
      await auditStrict(record, 'effect-1')

      expect(mockWriteAuditRecord).toHaveBeenCalledWith({ ...record, timestamp: 'effect-1' })
      expect(mockPublishAuditRecord).toHaveBeenCalledWith({ ...record, timestamp: 'effect-1' })
    })

    it('stamps the record with the time without an effect id', async () => {
      await auditStrict(record)

      expect(mockWriteAuditRecord).toHaveBeenCalledWith({ ...record, timestamp: expect.any(String) })
    })

    it('rejects, unpublished, when the write fails', async () => {
      const error = new Error('DB error')
      mockWriteAuditRecord.mockRejectedValueOnce(error)

      await expect(auditStrict(record, 'effect-1')).rejects.toBe(error)
      expect(mockPublishAuditRecord).not.toHaveBeenCalled()
    })
  })

  describe('auditTrail', () => {
    it('returns items from database', async () => {
      const records: JsonAuditRecord[] = [
        { auditKey: 'key', message: 'message', timestamp: '2021-01-01T00:00:00Z', user: 'user' },
      ]

      mockReadAuditTrail.mockResolvedValueOnce(records)

      const res = await auditTrail('key')

      expect(res).toBe(records)
      expect(mockReadAuditTrail).toHaveBeenCalledWith('key')
    })

    it('logs database error to console and returns empty array', async () => {
      const error = new Error('DB error')
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      mockReadAuditTrail.mockRejectedValueOnce(error)

      const res = await auditTrail('key')

      expect(res).toStrictEqual([])
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({
          auditKey: 'key',
          error: expect.objectContaining({ message: 'DB error' }),
          message: 'failed to read audit trail',
        }),
      ])
    })
  })
})
