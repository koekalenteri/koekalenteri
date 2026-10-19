import type { JsonDog, JsonDogEvent, JsonRegistration, Patch } from '../types'
import { legacyDayValue } from '../test-utils/finnishDays'
import { describeInTimeZone } from '../test-utils/timeZone'
import { storedDayKey } from './event'
import {
  legacyDogDay,
  legacyEventDay,
  legacyRegistrationDays,
  rekeyDogDays,
  rekeyEventDays,
  rekeyRegistrationDays,
  requestDay,
  withRegistrationDayKeys,
} from './storedDays'

// The instants a row stored before KOE-1547 holds: Finnish midnights in summer and in winter time, and
// the end of a Finnish day.
const SUMMER_MIDNIGHT = '2026-05-31T21:00:00.000Z' // 1.6.2026 00:00 in Finland
const WINTER_MIDNIGHT = '2026-01-31T22:00:00.000Z' // 1.2.2026 00:00 in Finland
const END_OF_DAY = '2026-05-17T20:59:59.999Z' // 17.5.2026 23:59:59.999 in Finland

/** Both decoders of an event's or an entry's day: a stored row's, in a migration or a request, and a request's. */
const eventDayReaders = [legacyEventDay, requestDay]

for (const zone of ['UTC', 'Europe/Helsinki', 'America/New_York', 'Asia/Tokyo']) {
  describeInTimeZone(zone, () => {
    describe('the day decoders', () => {
      it.each([
        ['a day key', '2026-06-01', '2026-06-01'],
        ['a Finnish midnight', SUMMER_MIDNIGHT, '2026-06-01'],
        ['the end of a Finnish day', END_OF_DAY, '2026-05-17'],
        // Stored on dev in offset form (KOE-1547): 84 event starts and 49 organizer stats keys.
        ['an instant with an offset', '2026-06-01T00:00:00.000+03:00', '2026-06-01'],
        ['a winter instant with an offset', '2026-02-01T00:00:00.000+02:00', '2026-02-01'],
        ['an end of day with an offset', '2026-09-02T23:59:59.999+03:00', '2026-09-02'],
      ])('reads %s as its Finnish day, however it is read', (_name, value, expected) => {
        for (const read of [...eventDayReaders, legacyDogDay]) expect(read(value)).toBe(expected)
      })

      // Days measured on dev (KOE-1547): a winter day's midnight worked out with the summer offset is
      // 23:00 the evening before in Helsinki, and the reverse 01:00; ends of day are an hour off too.
      it.each([
        ['Fri 23:00 for Sat 7.11. (GQ6rUY8RpY)', '2026-11-06T21:00:00.000Z', '2026-11-07'],
        ['Fri 23:00 for Sat 13.12. (ihNIIANc03, aVCQ5s2L1z)', '2025-12-12T21:00:00.000Z', '2025-12-13'],
        ['Fri 23:00 for Sat 3.1. (E8vPbdTCXn)', '2026-01-02T21:00:00.000Z', '2026-01-03'],
        ['Fri 01:00 for Fri 2.10. (WrGaAW3OCz)', '2026-10-01T22:00:00.000Z', '2026-10-02'],
        ['an end of day at Mon 00:59:59.999 for Sun 27.9.', '2026-09-27T21:59:59.999Z', '2026-09-27'],
        ['an end of day at Thu 22:59:59.999 for Thu 1.1.', '2026-01-01T20:59:59.999Z', '2026-01-01'],
        ['a UTC midnight', '2026-05-20T00:00:00.000Z', '2026-05-20'],
      ])("decodes an event's day stored an hour off as the day it was stored for: %s", (_name, value, expected) => {
        for (const read of eventDayReaders) expect(read(value)).toBe(expected)
      })

      // A browser on the bundle before KOE-1547 sends back the Dates it read. A migrated row's key it
      // read as UTC midnight, which is 02:00 or 03:00 in Finland: still the key's own day, as the
      // migration wrote it. The display readers show an hour-off day as the day it falls on until the
      // row is migrated (`storedDayKey`).
      it.each([
        ['a winter key read as UTC midnight', '2026-11-07T00:00:00.000Z', '2026-11-07'],
        ['a summer key read as UTC midnight', '2026-06-13T00:00:00.000Z', '2026-06-13'],
      ])("decodes %s as the key's day", (_name, value, expected) => {
        for (const read of eventDayReaders) expect(read(value)).toBe(expected)
      })

      it('shows an hour-off day as the day it falls on until its row is migrated', () => {
        expect(storedDayKey('2026-11-06T21:00:00.000Z')).toBe('2026-11-06')
        expect(requestDay('2026-11-06T21:00:00.000Z')).toBe('2026-11-07')
      })

      // A dog's dates carry a real time of day: they are read as the day the instant falls on.
      it.each([
        ['a time of day', '2023-07-18T06:04:03.332Z', '2023-07-18'],
        ['a Friday 23:00 in Helsinki', '2026-11-06T21:00:00.000Z', '2026-11-06'],
      ])("reads a dog's date at %s as the day it falls on", (_name, value, expected) => {
        expect(legacyDogDay(value)).toBe(expected)
      })

      it("reads Kennelliitto's stamp in a stored row, and refuses it in a request, which never sent one", () => {
        expect(legacyEventDay('2021-01-01T00:00:00')).toBe('2021-01-01')
        expect(legacyDogDay('2021-01-01T00:00:00')).toBe('2021-01-01')
        expect(requestDay('2021-01-01T00:00:00')).toBeUndefined()
      })

      it.each([
        ["Kennelliitto's empty date", '0001-01-01T00:00:00'],
        ['its empty date as a browser in Finland wrote it', '0000-12-31T22:20:11.000Z'],
        ['an empty value', ''],
        ['text', 'tomorrow'],
        ['a day the month does not have', '2026-02-30'],
        ['no text at all', 42],
      ])('reads %s as no day', (_name, value) => {
        for (const read of [...eventDayReaders, legacyDogDay]) expect(read(value)).toBeUndefined()
      })
    })
  })
}

describe('rekeyEventDays', () => {
  const storedEvent = (): Partial<JsonDogEvent> => ({
    classes: [
      { class: 'ALO', date: legacyDayValue(SUMMER_MIDNIGHT) },
      { class: 'AVO', date: '2026-06-02' },
    ],
    dates: [{ date: legacyDayValue(SUMMER_MIDNIGHT), time: 'ap' }],
    endDate: legacyDayValue('2026-06-01T21:00:00.000Z'),
    entryEndDate: legacyDayValue(END_OF_DAY),
    entryOrigEndDate: legacyDayValue('2026-05-10T20:59:59.999Z'),
    entryStartDate: legacyDayValue(WINTER_MIDNIGHT),
    kcEvent: {
      classes: [],
      endDate: legacyDayValue('2026-06-01T21:00:00.000Z'),
      eventType: 'NOME-B',
      startDate: legacyDayValue(SUMMER_MIDNIGHT),
    },
    qualificationStartDate: legacyDayValue('2025-08-18T21:00:00.000Z'),
    resultsPublished: { ALO: [SUMMER_MIDNIGHT], AVO: true },
    startDate: legacyDayValue(SUMMER_MIDNIGHT),
    startNumbersPublished: ['2026-06-01/ap', '2026-06-01T21:00:00.000Z'],
    stations: [{ date: legacyDayValue(SUMMER_MIDNIGHT), id: 'post-1', number: 1, tasks: 1 }],
  })

  it('writes every day of the event as the key of its Finnish day', () => {
    const event = storedEvent()

    expect(rekeyEventDays(event, legacyEventDay)).toEqual({ changed: true, unreadable: false })
    expect(event).toEqual({
      classes: [
        { class: 'ALO', date: '2026-06-01' },
        { class: 'AVO', date: '2026-06-02' },
      ],
      dates: [{ date: '2026-06-01', time: 'ap' }],
      endDate: '2026-06-02',
      entryEndDate: '2026-05-17',
      entryOrigEndDate: '2026-05-10',
      entryStartDate: '2026-02-01',
      kcEvent: { classes: [], endDate: '2026-06-02', eventType: 'NOME-B', startDate: '2026-06-01' },
      qualificationStartDate: '2025-08-19',
      resultsPublished: { ALO: ['2026-06-01'], AVO: true },
      startDate: '2026-06-01',
      // A half day stays as it is.
      startNumbersPublished: ['2026-06-01/ap', '2026-06-02'],
      stations: [{ date: '2026-06-01', id: 'post-1', number: 1, tasks: 1 }],
    })
  })

  it('leaves an event whose days are keys as it is, so a second run changes nothing', () => {
    const event = storedEvent()
    rekeyEventDays(event, legacyEventDay)
    const once = structuredClone(event)

    expect(rekeyEventDays(event, legacyEventDay)).toEqual({ changed: false, unreadable: false })
    expect(event).toEqual(once)
  })

  it('leaves a day it cannot read as it is and says so', () => {
    const event: Partial<JsonDogEvent> = {
      endDate: legacyDayValue(SUMMER_MIDNIGHT),
      resultsPublished: ['not-a-dayTx'],
      startDate: legacyDayValue('not-a-date'),
    }

    expect(rekeyEventDays(event, legacyEventDay)).toEqual({ changed: true, unreadable: true })
    expect(event).toEqual({ endDate: '2026-06-01', resultsPublished: ['not-a-dayTx'], startDate: 'not-a-date' })
  })

  // Kennelliitto lists a one-day trial's end as its empty date (year 1); stored raw, or as the instant
  // a browser made of it, it is no day, and the field goes.
  it("removes an optional day that is Kennelliitto's empty date, and counts the event as changed", () => {
    const event: Partial<JsonDogEvent> = {
      endDate: '2026-06-01',
      entryEndDate: legacyDayValue('0000-12-31T22:20:11.000Z'),
      kcEvent: {
        classes: [],
        endDate: legacyDayValue('0001-01-01T00:00:00'),
        eventType: 'NOU',
        startDate: '2026-06-01',
      },
      startDate: '2026-06-01',
    }

    expect(rekeyEventDays(event, legacyEventDay)).toEqual({ changed: true, unreadable: false })
    // The fields are gone, not set to undefined.
    expect(event).toStrictEqual({
      endDate: '2026-06-01',
      kcEvent: { classes: [], eventType: 'NOU', startDate: '2026-06-01' },
      startDate: '2026-06-01',
    })
  })

  it("keeps a required day that is Kennelliitto's empty date, as one it cannot read", () => {
    const event: Partial<JsonDogEvent> = { endDate: legacyDayValue('0001-01-01T00:00:00'), startDate: '2026-06-01' }

    expect(rekeyEventDays(event, legacyEventDay)).toEqual({ changed: false, unreadable: true })
    expect(event.endDate).toBe('0001-01-01T00:00:00')
  })

  it('takes a patch, whose deleted fields are null and whose lists may hold null', () => {
    const patch: Patch<JsonDogEvent> = {
      classes: [null, { class: 'ALO', date: legacyDayValue(SUMMER_MIDNIGHT) }],
      entryEndDate: null,
      startNumbersPublished: { ALO: [null, SUMMER_MIDNIGHT], AVO: null },
    }

    rekeyEventDays(patch, requestDay)

    expect(patch).toEqual({
      classes: [null, { class: 'ALO', date: '2026-06-01' }],
      entryEndDate: null,
      startNumbersPublished: { ALO: [null, '2026-06-01'], AVO: null },
    })
  })
})

describe('rekeyRegistrationDays', () => {
  const storedRegistration = (): Partial<JsonRegistration> => ({
    dates: [{ date: legacyDayValue(SUMMER_MIDNIGHT), time: 'ap' }],
    dog: {
      // A browser's local noon of the birth day, as the JSON reviver made of a bare day (KOE-1131).
      dob: legacyDayValue('2021-01-01T10:00:00.000Z'),
      regNo: 'FI1/21',
      results: [
        {
          class: 'ALO',
          date: legacyDayValue('2025-06-01T00:00:00'),
          judge: 'J',
          location: 'L',
          result: 'ALO1',
          type: 'NOME-B',
        },
      ],
    },
    // An older copy keyed the start by the UTC day (KOE-1541).
    group: { date: legacyDayValue(SUMMER_MIDNIGHT), key: '2026-05-31-ap', number: 1, time: 'ap' },
    qualifyingResults: [
      {
        class: 'ALO',
        date: legacyDayValue('0001-01-01T00:00:00'),
        judge: 'J',
        location: 'L',
        official: true,
        result: 'ALO1',
        type: 'NOME-B',
      },
    ],
    results: [
      {
        class: 'ALO',
        date: legacyDayValue('2025-05-31T21:00:00.000Z'),
        id: 'm1',
        judge: 'J',
        location: 'L',
        result: 'ALO1',
        type: 'NOME-B',
      },
    ],
    startGroup: { date: legacyDayValue(SUMMER_MIDNIGHT), key: '2026-05-31-ap', number: 1, time: 'ap' },
  })

  it("writes the entry's days, its starts' keys and the dog's dates as keys", () => {
    const registration = storedRegistration()

    expect(rekeyRegistrationDays(registration, legacyRegistrationDays)).toEqual({ changed: true, unreadable: false })
    expect(registration).toEqual({
      dates: [{ date: '2026-06-01', time: 'ap' }],
      dog: {
        dob: '2021-01-01',
        regNo: 'FI1/21',
        results: [{ class: 'ALO', date: '2025-06-01', judge: 'J', location: 'L', result: 'ALO1', type: 'NOME-B' }],
      },
      group: { date: '2026-06-01', key: '2026-06-01-ap', number: 1, time: 'ap' },
      // Kennelliitto's empty date is a result without a day.
      qualifyingResults: [
        { class: 'ALO', date: '', judge: 'J', location: 'L', official: true, result: 'ALO1', type: 'NOME-B' },
      ],
      results: [
        { class: 'ALO', date: '2025-06-01', id: 'm1', judge: 'J', location: 'L', result: 'ALO1', type: 'NOME-B' },
      ],
      startGroup: { date: '2026-06-01', key: '2026-06-01-ap', number: 1, time: 'ap' },
    })
  })

  // An entry's days and groups' days are read by the event rule, the dog's dates by the day the
  // instant falls on: the same Friday 23:00 is Saturday for the one and Friday for the other.
  it("reads the entry's days by the event rule and the dog's dates by the day they fall on", () => {
    const friday23 = legacyDayValue('2026-11-06T21:00:00.000Z')
    const registration: Partial<JsonRegistration> = {
      dates: [{ date: friday23, time: 'ap' }],
      dog: {
        dob: friday23,
        regNo: 'FI1/21',
        results: [{ class: 'ALO', date: friday23, judge: 'J', location: 'L', result: 'ALO1', type: 'NOME-B' }],
      },
      group: { date: friday23, key: '2026-11-06-ap', number: 1, time: 'ap' },
      qualifyingResults: [
        { class: 'ALO', date: friday23, judge: 'J', location: 'L', official: true, result: 'ALO1', type: 'NOME-B' },
      ],
      results: [{ class: 'ALO', date: friday23, id: 'm1', judge: 'J', location: 'L', result: 'ALO1', type: 'NOME-B' }],
      startGroup: { date: legacyDayValue('2025-12-12T21:00:00.000Z'), key: '2025-12-12-ap', number: 1, time: 'ap' },
    }

    rekeyRegistrationDays(registration, legacyRegistrationDays)

    expect(registration.dates).toEqual([{ date: '2026-11-07', time: 'ap' }])
    expect(registration.group).toEqual({ date: '2026-11-07', key: '2026-11-07-ap', number: 1, time: 'ap' })
    expect(registration.startGroup).toEqual({ date: '2025-12-13', key: '2025-12-13-ap', number: 1, time: 'ap' })
    expect(registration.dog?.dob).toBe('2026-11-06')
    expect(registration.dog?.results?.[0].date).toBe('2026-11-06')
    expect(registration.qualifyingResults?.[0].date).toBe('2026-11-06')
    expect(registration.results?.[0].date).toBe('2026-11-06')
  })

  it('leaves a registration whose days are keys as it is', () => {
    const registration = storedRegistration()
    rekeyRegistrationDays(registration, legacyRegistrationDays)

    expect(rekeyRegistrationDays(registration, legacyRegistrationDays)).toEqual({ changed: false, unreadable: false })
  })

  it.each([
    ['the reserve', 'reserve'],
    ['the cancelled list', 'cancelled'],
  ])('keeps the key of %s, which names no day', (_name, key) => {
    const registration: Partial<JsonRegistration> = {
      group: { date: legacyDayValue(SUMMER_MIDNIGHT), key, number: 3, time: 'ap' },
    }

    rekeyRegistrationDays(registration, legacyRegistrationDays)

    expect(registration.group).toEqual({ date: '2026-06-01', key, number: 3, time: 'ap' })
  })

  it("removes a birth date that is Kennelliitto's empty date, and keeps one it cannot read", () => {
    const empty: Partial<JsonRegistration> = {
      dog: { dob: legacyDayValue('0000-12-31T22:00:00.000Z'), regNo: 'FI1/21' },
    }
    const unreadable: Partial<JsonRegistration> = { dog: { dob: legacyDayValue('31.12.2020'), regNo: 'FI1/21' } }

    expect(rekeyRegistrationDays(empty, legacyRegistrationDays)).toEqual({ changed: true, unreadable: false })
    expect(empty.dog).toStrictEqual({ regNo: 'FI1/21' })
    expect(rekeyRegistrationDays(unreadable, legacyRegistrationDays)).toEqual({ changed: false, unreadable: true })
    expect(unreadable.dog).toEqual({ dob: '31.12.2020', regNo: 'FI1/21' })
  })

  it('leaves a group whose day it cannot read, and its key, as they are', () => {
    const registration: Partial<JsonRegistration> = {
      group: { date: legacyDayValue('eilen'), key: 'stored', number: 1, time: 'ap' },
    }

    expect(rekeyRegistrationDays(registration, legacyRegistrationDays)).toEqual({ changed: false, unreadable: true })
    expect(registration.group).toEqual({ date: 'eilen', key: 'stored', number: 1, time: 'ap' })
  })
})

describe('rekeyDogDays', () => {
  it("writes the dog's birth date and results' days as keys", () => {
    const dog: JsonDog = {
      dob: legacyDayValue('2021-01-01T00:00:00'),
      regNo: 'FI1/21',
      results: [
        {
          class: 'ALO',
          date: legacyDayValue('2025-06-01T00:00:00'),
          judge: 'J',
          location: 'L',
          result: 'ALO1',
          type: 'NOME-B',
        },
        { class: 'AVO', date: '', judge: 'J', location: 'L', result: 'AVO1', type: 'NOME-B' },
      ],
    }

    expect(rekeyDogDays(dog, legacyDogDay)).toEqual({ changed: true, unreadable: false })
    expect(dog.dob).toBe('2021-01-01')
    expect(dog.results?.map(({ date }) => date)).toEqual(['2025-06-01', ''])
  })
})

describe('withRegistrationDayKeys', () => {
  // A save is compared by the days its migration writes: an entry's day by the day it was stored for,
  // a dog's date by the day it falls on.
  it("reads an entry's day an hour off by the event rule and a dog's Friday 23:00 by the day it falls on", () => {
    const registration: Partial<JsonRegistration> = {
      dates: [{ date: legacyDayValue('2025-12-12T21:00:00.000Z'), time: 'ap' }],
      dog: { dob: legacyDayValue('2026-11-06T21:00:00.000Z'), regNo: 'FI1/21' },
    }

    expect(withRegistrationDayKeys(registration)).toEqual({
      dates: [{ date: '2025-12-13', time: 'ap' }],
      dog: { dob: '2026-11-06', regNo: 'FI1/21' },
    })
  })

  it('answers a copy with the days as keys and leaves the registration as it was', () => {
    const registration: Partial<JsonRegistration> = { dates: [{ date: legacyDayValue(SUMMER_MIDNIGHT), time: 'ap' }] }

    expect(withRegistrationDayKeys(registration)).toEqual({ dates: [{ date: '2026-06-01', time: 'ap' }] })
    expect(registration).toEqual({ dates: [{ date: SUMMER_MIDNIGHT, time: 'ap' }] })
  })
})
