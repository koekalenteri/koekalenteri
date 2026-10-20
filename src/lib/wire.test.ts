import type { JsonAuditRecord, JsonDogEvent, JsonRegistration, JsonUser, KcState, Patch, User } from '../types'
import { legacyDayValue } from '../test-utils/finnishDays'
import { describeInTimeZone } from '../test-utils/timeZone'
import { isDayKey, TIME_ZONE } from './day'
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
  toStoredDog,
  toStoredManualTestResult,
  toStoredRegistration,
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
        dates: [{ date: '2026-05-02', time: 'ap' }],
        dog: { dob: '2020-02-03', regNo: 'FI1/20', results: [] },
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
      // A day key stays the key it is in the model (KOE-1547).
      expect(registration.dates[0].date).toBe('2026-05-02')
      expect(registration.dog.dob).toBe('2020-02-03')
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
        classes: [{ class: 'ALO', date: '2026-05-02' }, null],
        invitationAttachmentHistory: { key1: { uploadedAt: '2026-05-01T08:00:00.000Z' }, key2: null },
      } satisfies Patch<JsonDogEvent>)

      expect(patch.classes).toEqual([{ class: 'ALO', date: '2026-05-02' }, null])
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

    it("reads a start list row's dog dates and placement as day keys", () => {
      const row = toPublicRegistration({
        breeder: 'b',
        dog: { dob: legacyDayValue('2020-02-02T22:00:00.000Z'), regNo: 'FI1/20', results: [] },
        group: { date: legacyDayValue('2026-09-11T21:00:00.000Z'), key: '2026-09-12', number: 1 },
        handler: 'h',
        owner: 'o',
      })

      expect(row.dog.dob).toBe('2020-02-03')
      expect(row.group).toEqual({ date: '2026-09-12', key: '2026-09-12', number: 1 })
    })

    // KOE-1547: the server stores and sends an event's days, a registration's days and a group's day as
    // keys, and the model holds them as keys in every host zone. A row not yet migrated sends the Finnish
    // midnight it holds, which the model holds as its day.
    for (const zone of [TIME_ZONE, 'America/New_York', 'Asia/Tokyo']) {
      describeInTimeZone(zone, () => {
        it('holds a day key as it is, and the Finnish midnight a row not yet migrated holds as its day', () => {
          const event = toDogEvent({
            classes: [{ class: 'ALO', date: '2026-05-20' }],
            dates: [{ date: '2026-05-20', time: 'ap' }],
            endDate: '2026-05-21',
            entryEndDate: '2026-05-10',
            startDate: legacyDayValue('2026-05-19T21:00:00.000Z'),
          })
          const group = toRegistration({ group: { date: '2026-05-20', key: '2026-05-20-ap', number: 1, time: 'ap' } })

          expect(event.startDate).toBe('2026-05-20')
          expect(event.endDate).toBe('2026-05-21')
          expect(event.entryEndDate).toBe('2026-05-10')
          expect(event.classes?.[0].date).toBe('2026-05-20')
          expect(event.dates?.[0].date).toBe('2026-05-20')
          expect(group.group?.date).toBe('2026-05-20')
        })
      })
    }

    // KOE-1547 part 2: the browser model holds the days as the keys the server sends, so the bodies it
    // sends back are keys. A row not yet migrated, or a value this browser cached before, holds an
    // instant: it is read as the day the migration writes, an hour-off midnight and end of day included.
    for (const zone of [TIME_ZONE, 'America/New_York', 'Asia/Tokyo']) {
      describeInTimeZone(zone, () => {
        it('holds a day key as the key, and an instant as the day the migration writes', () => {
          const event = toDogEvent({
            classes: [{ class: 'ALO', date: '2026-11-07' }],
            dates: [{ date: legacyDayValue('2026-11-06T21:00:00.000Z'), time: 'ap' }],
            endDate: '2026-11-08',
            entryEndDate: legacyDayValue('2026-09-27T21:59:59.999Z'),
            startDate: legacyDayValue('2026-11-06T21:00:00.000Z'),
          })
          const draft = toStoredRegistration({
            dates: [{ date: legacyDayValue('2026-11-06T22:00:00.000Z'), time: 'ap' }],
          })

          expect(JSON.parse(JSON.stringify(event))).toMatchObject({
            classes: [{ class: 'ALO', date: '2026-11-07' }],
            dates: [{ date: '2026-11-07', time: 'ap' }],
            endDate: '2026-11-08',
            entryEndDate: '2026-09-27',
            startDate: '2026-11-07',
          })
          expect(JSON.parse(JSON.stringify(draft))).toEqual({ dates: [{ date: '2026-11-07', time: 'ap' }] })
        })
      })
    }

    it("keeps a Kennelliitto trial's days as their keys", () => {
      const event = toDogEvent({
        kcEvent: { classes: [], endDate: '2026-06-02', eventType: 'NOU', startDate: '2026-06-01' },
      })

      expect(event.kcEvent).toEqual({
        classes: [],
        endDate: '2026-06-02',
        eventType: 'NOU',
        startDate: '2026-06-01',
      })
    })

    // The migration removes a Kennelliitto trial's end that was its empty date (KOE-1547).
    it('leaves a Kennelliitto trial without an end without one', () => {
      const event = toDogEvent({ kcEvent: { classes: [], eventType: 'NOU', startDate: '2026-06-01' } })

      expect(event.kcEvent).toEqual({ classes: [], eventType: 'NOU', startDate: '2026-06-01' })
      expect(event.kcEvent && 'endDate' in event.kcEvent).toBe(false)
    })

    it("makes an event's Kennelliitto state a Date, and a stats row's day its key", () => {
      const event = toDogEvent({ kcState: { code: 1253, name: 'Luovutettu', readAt: '2026-09-13T08:00:00.000Z' } })
      expect(event.kcState).toEqual({ code: 1253, name: 'Luovutettu', readAt: new Date('2026-09-13T08:00:00.000Z') })

      const row = toEventStatsItem({ date: '2026-09-11T21:00:00.000Z', PK: 'ORG#1', SK: '2026-09-12#e1' })
      // A row stored before KOE-1547 holds the Finnish midnight of its day.
      expect(row.date).toBe('2026-09-12')
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
      it("reads Kennelliitto's zone-less stamps of a trial as the days they name", () => {
        const choice = toEventKcIdChoice({
          classes: [],
          endDate: legacyDayValue('0001-01-01T00:00:00'),
          entryEndDate: legacyDayValue('2026-06-07T00:00:00'),
          entryStartDate: '2026-05-17',
          eventType: 'NOME-B',
          kcGuid: null,
          name: 'n',
          organizer: 'o',
          startDate: legacyDayValue('2026-06-28T00:00:00'),
        })

        expect(choice.startDate).toBe('2026-06-28')
        expect(choice.entryEndDate).toBe('2026-06-07')
        expect(choice.entryStartDate).toBe('2026-05-17')
        // Kennelliitto's "no end" is the year 1, which is no day: it stays as sent, and the search's
        // normalizer (normalizeEventKcIdChoice) takes the start for it.
        expect(choice.endDate).toBe('0001-01-01T00:00:00')
        expect(isDayKey(choice.endDate)).toBe(false)
      })
    }

    describeInTimeZone('Asia/Tokyo', finnishLocalCases)
    describeInTimeZone('Pacific/Pago_Pago', finnishLocalCases)

    // A dog's dates are days (KOE-1548), read from every form they were stored in. What the server sends
    // reads an instant as its Finnish day; what this browser stored, as the day its picker showed.
    const result = (date: string) => ({
      class: 'ALO',
      date: legacyDayValue(date),
      judge: 'j',
      location: 'l',
      result: 'ALO1',
      type: 'NOME-B',
    })
    const tokyoMidnight = '2020-12-31T15:00:00.000Z' // 1.1.2021 00:00 in Tokyo, 31.12.2020 17:00 in Finland

    for (const zone of [TIME_ZONE, 'America/New_York', 'Asia/Tokyo']) {
      describeInTimeZone(zone, () => {
        it.each([
          ['a day key', '2021-01-01', '2021-01-01'],
          ["Kennelliitto's stamp", '2021-01-01T00:00:00', '2021-01-01'],
          ['an instant, as its Finnish day', tokyoMidnight, '2020-12-31'],
        ])("reads a dog's dates from the server, %s", (_name, value, expected) => {
          const dog = toDog({ dob: legacyDayValue(value), regNo: 'FI1/21', results: [result(value)] })
          const registration = toRegistration({
            ...stamps,
            dog: { dob: legacyDayValue(value), regNo: 'FI1/21', results: [result(value)] },
            qualifyingResults: [{ ...result(value), official: true }],
            results: [{ ...result(value), id: 'm1' }],
          })

          expect([dog.dob, dog.results[0].date]).toEqual([expected, expected])
          expect(registration.dog?.dob).toBe(expected)
          expect(registration.dog?.results[0].date).toBe(expected)
          expect(registration.qualifyingResults?.[0].date).toBe(expected)
          expect(registration.results?.[0].date).toBe(expected)
        })

        it('reads a draft this browser stored, an instant as the day its picker showed', () => {
          const localMidnight = new Date(2021, 0, 1).toISOString()
          const draft = toStoredRegistration({
            ...stamps,
            dog: { dob: legacyDayValue(localMidnight), regNo: 'FI1/21', results: [result(localMidnight)] },
            qualifyingResults: [{ ...result(localMidnight), official: true }],
            results: [{ ...result(localMidnight), id: 'm1' }],
          })

          expect(draft.dog?.dob).toBe('2021-01-01')
          expect(draft.dog?.results[0].date).toBe('2021-01-01')
          expect(draft.qualifyingResults?.[0].date).toBe('2021-01-01')
          expect(draft.results?.[0].date).toBe('2021-01-01')
          expect(toStoredDog({ dob: legacyDayValue(localMidnight), regNo: 'FI1/21' }).dob).toBe('2021-01-01')
          expect(toStoredManualTestResult({ ...result(localMidnight), id: 'm1' }).date).toBe('2021-01-01')
        })

        it("reads Kennelliitto's empty date as no day in every form, without throwing", () => {
          for (const empty of ['0001-01-01T00:00:00', '0001-01-01T00:00:00.000Z', '0000-12-31T22:00:00.000Z']) {
            expect(toDog({ dob: legacyDayValue(empty), regNo: 'FI1/21', results: [result(empty)] })).toEqual(
              expect.objectContaining({ dob: undefined, results: [expect.objectContaining({ date: undefined })] })
            )
            expect(toStoredDog({ dob: legacyDayValue(empty), regNo: 'FI1/21' }).dob).toBeUndefined()
          }
        })
      })
    }

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
      // @ts-expect-error `name` holds no Date, and its rule makes one.
      converter<{ name: string }, { name: string }>()({ name: timestamp })
      const same = (date: Date) => date
      const sameUser = (user: Partial<User>) => user
      // @ts-expect-error A full spec cannot make a model its own wire type.
      converter<KcState, KcState>()({ readAt: same })
      // @ts-expect-error A full spec cannot make a wire type that holds Partial<User>.
      converter<{ official: Partial<User> }, { official: Partial<User> }>()({ official: sameUser })
      // @ts-expect-error A key the model does not have is refused even when it is spread in.
      converter<JsonUser, User>()({ ...{ ...dbRecordRules, lastSeen: timestamp, notAKey: timestamp } })

      expect(converter<{ name: string }, { name: string }>()({})({ name: 'n' })).toEqual({ name: 'n' })
    })
  })
})
