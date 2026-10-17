import type { EventKcIdChoice, JsonAuditRecord, JsonDogEvent, JsonRegistration, JsonUser, Patch, User } from '../types'
import {
  arrayOf,
  converter,
  recordOf,
  timestamp,
  toAuditRecord,
  toCollection,
  toDogEvent,
  toRegistration,
  toUser,
} from './wire'

/** The row's stamps as the API writes them; the names the model expects as `Date`s. */
const stamps = {
  createdAt: '2026-01-02T10:00:00.000Z',
  createdBy: 'seed',
  modifiedAt: '2026-01-03T10:00:00.000Z',
  modifiedBy: 'seed',
}

describe('wire', () => {
  describe('converter', () => {
    it('makes a Date of every named field, and leaves a text that looks like a date alone', () => {
      const registration = toRegistration({
        ...stamps,
        agreeToTerms: true,
        breeder: { name: 'b' },
        cancelReason: '2024-05-01',
        dates: [{ date: '2026-05-01T21:00:00.000Z', time: 'ap' }],
        dog: { dob: '2020-02-02T22:00:00.000Z', regNo: 'FI1/20', results: [] },
        eventId: 'e1',
        eventType: 'NOME-B',
        id: 'r1',
        language: 'fi',
        lastEmail: { context: '', sentAt: '2026-05-02T08:00:00.000Z', template: 'registration' },
        notes: '2026-05-01T08:00:00.000Z',
        paidAt: '2026-05-03T08:00:00.000Z',
        qualifyingResults: [],
        reserve: '',
      } satisfies JsonRegistration)

      expect(registration.createdAt).toEqual(new Date('2026-01-02T10:00:00.000Z'))
      expect(registration.paidAt).toEqual(new Date('2026-05-03T08:00:00.000Z'))
      expect(registration.dates[0].date).toEqual(new Date('2026-05-01T21:00:00.000Z'))
      expect(registration.dog.dob).toEqual(new Date('2020-02-02T22:00:00.000Z'))
      expect(registration.lastEmail).toEqual({
        context: '',
        sentAt: new Date('2026-05-02T08:00:00.000Z'),
        template: 'registration',
      })
      expect(registration.cancelReason).toBe('2024-05-01')
      expect(registration.notes).toBe('2026-05-01T08:00:00.000Z')
    })

    it('converts only the fields present: an absent or explicitly undefined field stays absent', () => {
      const patch = toUser({ id: 'u1', lastSeen: undefined, name: 'Name' })

      expect(patch).toEqual({ id: 'u1', lastSeen: undefined, name: 'Name' })
      expect('deletedAt' in patch).toBe(false)
    })

    it('keeps a null, which a patch deletes a field with', () => {
      const patch = toRegistration({ group: null, id: 'r1', paidAt: null } satisfies Patch<JsonRegistration>)

      expect(patch).toEqual({ group: null, id: 'r1', paidAt: null })
    })

    it('leaves a null element of a list and a null entry of a map as they are', () => {
      const patch = toDogEvent({
        classes: [{ class: 'ALO', date: '2026-05-01T21:00:00.000Z' }, null],
        invitationAttachmentHistory: { key1: { uploadedAt: '2026-05-01T08:00:00.000Z' }, key2: null },
      } satisfies Patch<JsonDogEvent>)

      expect(patch.classes).toEqual([{ class: 'ALO', date: new Date('2026-05-01T21:00:00.000Z') }, null])
      expect(patch.invitationAttachmentHistory).toEqual({
        key1: { uploadedAt: new Date('2026-05-01T08:00:00.000Z') },
        key2: null,
      })
    })

    it('does not touch the input', () => {
      const json: JsonUser = { ...stamps, email: 'a@b.c', id: 'u1', lastSeen: '2026-05-01T08:00:00.000Z', name: 'N' }
      const user = toUser(json)

      expect(json.lastSeen).toBe('2026-05-01T08:00:00.000Z')
      expect(user.lastSeen).toEqual(new Date('2026-05-01T08:00:00.000Z'))
    })

    it('reads a day key list as the strings they are', () => {
      const event = toDogEvent({ startNumbersPublished: { ALO: ['2026-05-01', '2026-05-02/ap'] } })

      expect(event.startNumbersPublished).toEqual({ ALO: ['2026-05-01', '2026-05-02/ap'] })
    })

    it('leaves the parameters of an audit row as written: a day key is a string, the stamp a Date', () => {
      const record = toAuditRecord({
        auditKey: 'event:e1',
        changes: [{ field: 'startDate', next: { text: '2026-05-01T21:00:00.000Z' }, previous: { state: 'empty' } }],
        messageKey: 'audit.messages.groupChanged',
        messageParams: { toDate: '2026-05-01', toNumber: 1 },
        timestamp: '2026-05-01T08:00:00.000Z',
        user: 'u',
      } satisfies JsonAuditRecord)

      expect(record.timestamp).toEqual(new Date('2026-05-01T08:00:00.000Z'))
      expect(record.messageParams).toEqual({ toDate: '2026-05-01', toNumber: 1 })
      expect(record.changes?.[0].next.text).toBe('2026-05-01T21:00:00.000Z')
    })
  })

  describe('rules', () => {
    it('timestamp makes a Date of an ISO string', () => {
      expect(timestamp('2026-05-01T08:00:00.000Z')).toEqual(new Date('2026-05-01T08:00:00.000Z'))
    })

    it('arrayOf and recordOf apply a converter to every element present', () => {
      const toItem = converter<{ at: string }, { at: Date }>({ at: timestamp })

      expect(arrayOf(toItem)([{ at: '2026-05-01T08:00:00.000Z' }])).toEqual([
        { at: new Date('2026-05-01T08:00:00.000Z') },
      ])
      expect(recordOf(toItem)({ a: { at: '2026-05-01T08:00:00.000Z' } })).toEqual({
        a: { at: new Date('2026-05-01T08:00:00.000Z') },
      })
    })

    it('toCollection converts a full list and an incremental response alike', () => {
      const toItem = converter<{ at: string }, { at: Date }>({ at: timestamp })
      const item = { at: '2026-05-01T08:00:00.000Z' }
      const converted = { at: new Date('2026-05-01T08:00:00.000Z') }

      expect(toCollection([item], toItem)).toEqual([converted])
      expect(toCollection({ cursor: 1, deletedIds: ['x'], items: [item] }, toItem)).toEqual({
        cursor: 1,
        deletedIds: ['x'],
        items: [converted],
      })
    })
  })

  describe('the compiler checks the field list', () => {
    it('refuses a spec that leaves a Date field out, names a field that holds none, or takes a model for the wire', () => {
      // @ts-expect-error `lastSeen` holds a Date and is not named.
      converter<JsonUser, User>({
        createdAt: timestamp,
        deletedAt: timestamp,
        modifiedAt: timestamp,
        updatedAt: timestamp,
      })
      // @ts-expect-error `name` holds no Date.
      converter<{ name: string }, { name: string }>({ name: timestamp })
      // @ts-expect-error The wire type holds a Date: the model cannot stand in for its own wire shape.
      converter<EventKcIdChoice, EventKcIdChoice>({})
      // @ts-expect-error A nested type with Date fields (Partial<User>) makes the wire type hold a Date.
      converter<{ official: Partial<User> }, { official: Partial<User> }>({ official: toUser })

      expect(converter<{ name: string }, { name: string }>({})({ name: 'n' })).toEqual({ name: 'n' })
    })
  })
})
