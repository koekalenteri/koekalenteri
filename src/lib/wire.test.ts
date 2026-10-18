import type { EventKcIdChoice, JsonAuditRecord, JsonDogEvent, JsonRegistration, JsonUser, Patch, User } from '../types'
import { describeInTimeZone } from '../test-utils/timeZone'
import {
  arrayOf,
  converter,
  recordOf,
  timestamp,
  toAuditRecord,
  toCollection,
  toDog,
  toDogEvent,
  toEventKcIdChoice,
  toEventStatsItem,
  toPublicRegistration,
  toRegistration,
  toUser,
} from './wire'

const dbRecordRules = { createdAt: timestamp, deletedAt: timestamp, modifiedAt: timestamp, updatedAt: timestamp }

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

    it('keeps a message recorded as text before KOE-1454 as the text it is', () => {
      expect(toRegistration({ id: 'r1', lastEmail: 'Koekutsu 1.1.2026 12:00' })).toEqual({
        id: 'r1',
        lastEmail: 'Koekutsu 1.1.2026 12:00',
      })
    })

    it('makes the dog and the placement of a start list row Dates', () => {
      const row = toPublicRegistration({
        breeder: 'b',
        dog: { dob: '2020-02-02T22:00:00.000Z', regNo: 'FI1/20', results: [] },
        group: { date: '2026-09-11T21:00:00.000Z', key: '2026-09-12', number: 1 },
        handler: 'h',
        owner: 'o',
      })

      expect(row.dog.dob).toEqual(new Date('2020-02-02T22:00:00.000Z'))
      expect(row.group).toEqual({ date: new Date('2026-09-11T21:00:00.000Z'), key: '2026-09-12', number: 1 })
    })

    it("makes an event's Kennelliitto state and a stats row's day Dates", () => {
      const event = toDogEvent({ kcState: { code: 1253, name: 'Luovutettu', readAt: '2026-09-13T08:00:00.000Z' } })
      expect(event.kcState).toEqual({ code: 1253, name: 'Luovutettu', readAt: new Date('2026-09-13T08:00:00.000Z') })

      const row = toEventStatsItem({ date: '2026-09-11T21:00:00.000Z', PK: 'ORG#1', SK: '2026-09-12#e1' })
      expect(row.date).toEqual(new Date('2026-09-11T21:00:00.000Z'))
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

    /**
     * Kennelliitto writes its stamps without a zone; read as the browser's local time, a browser east
     * of Finland would see the evening before. Run in two zones, so the rule is checked whatever zone
     * the machine is in and the result is seen not to depend on it.
     */
    const finnishLocalCases = () => {
      it("reads Kennelliitto's zone-less stamps of a trial as Finnish local time", () => {
        const choice = toEventKcIdChoice({
          classes: [],
          endDate: '0001-01-01T00:00:00',
          entryEndDate: '2026-06-07T00:00:00',
          entryStartDate: '2026-05-17',
          eventType: 'NOME-B',
          kcGuid: null,
          name: 'n',
          organizer: 'o',
          startDate: '2026-06-28T00:00:00',
        })

        expect(choice.startDate).toEqual(new Date('2026-06-27T21:00:00.000Z'))
        expect(choice.entryEndDate).toEqual(new Date('2026-06-06T21:00:00.000Z'))
        // A bare day is that day in Finland.
        expect(choice.entryStartDate).toEqual(new Date('2026-05-16T21:00:00.000Z'))
        // Kennelliitto's "no end" is the year 1, which the search's normalizer reads by its year.
        expect(choice.endDate.getFullYear()).toBeLessThanOrEqual(1)
      })
    }

    describeInTimeZone('Asia/Tokyo', finnishLocalCases)
    describeInTimeZone('Pacific/Pago_Pago', finnishLocalCases)

    it("passes a dog's zoned birthday and result day through as the instants they are", () => {
      const dog = toDog({
        dob: '2021-01-01T10:00:00.000Z',
        regNo: 'FI1/21',
        results: [
          { class: 'ALO', date: '2025-09-11T21:00:00.000Z', judge: 'j', location: 'l', result: 'ALO1', type: 'NOME-B' },
        ],
      })

      expect(dog.dob).toEqual(new Date('2021-01-01T10:00:00.000Z'))
      expect(dog.results[0].date).toEqual(new Date('2025-09-11T21:00:00.000Z'))
    })

    it('arrayOf and recordOf apply a converter to every element present', () => {
      const toItem = converter<{ at: string }, { at: Date }>()({ at: timestamp })

      expect(arrayOf(toItem)([{ at: '2026-05-01T08:00:00.000Z' }])).toEqual([
        { at: new Date('2026-05-01T08:00:00.000Z') },
      ])
      expect(recordOf(toItem)({ a: { at: '2026-05-01T08:00:00.000Z' } })).toEqual({
        a: { at: new Date('2026-05-01T08:00:00.000Z') },
      })
    })

    it('toCollection converts a full list and an incremental response alike', () => {
      const toItem = converter<{ at: string }, { at: Date }>()({ at: timestamp })
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
      converter<JsonUser, User>()({
        createdAt: timestamp,
        deletedAt: timestamp,
        modifiedAt: timestamp,
        updatedAt: timestamp,
      })
      // @ts-expect-error `name` holds no Date.
      converter<{ name: string }, { name: string }>()({ name: timestamp })
      const same = (date: Date) => date
      const sameUser = (user: Partial<User>) => user
      // @ts-expect-error A full spec cannot make a model its own wire type.
      converter<EventKcIdChoice, EventKcIdChoice>()({
        endDate: same,
        entryEndDate: same,
        entryStartDate: same,
        startDate: same,
      })
      // @ts-expect-error A full spec cannot make a wire type that holds Partial<User>.
      converter<{ official: Partial<User> }, { official: Partial<User> }>()({ official: sameUser })
      // @ts-expect-error A key the model does not have is refused even when it is spread in.
      converter<JsonUser, User>()({ ...{ ...dbRecordRules, lastSeen: timestamp, notAKey: timestamp } })

      expect(converter<{ name: string }, { name: string }>()({})({ name: 'n' })).toEqual({ name: 'n' })
    })
  })
})
