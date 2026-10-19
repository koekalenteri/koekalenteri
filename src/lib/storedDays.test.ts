import type { JsonDog, JsonDogEvent, JsonRegistration, Patch } from '../types'
import { beforeDayKeys } from '../test-utils/finnishDays'
import { describeInTimeZone } from '../test-utils/timeZone'
import {
  legacyDay,
  rekeyDogDays,
  rekeyEventDays,
  rekeyRegistrationDays,
  requestDay,
  storedDay,
  withRegistrationDayKeys,
} from './storedDays'

// The instants a row stored before KOE-1547 holds: Finnish midnights in summer and in winter time, and
// the end of a Finnish day.
const SUMMER_MIDNIGHT = '2026-05-31T21:00:00.000Z' // 1.6.2026 00:00 in Finland
const WINTER_MIDNIGHT = '2026-01-31T22:00:00.000Z' // 1.2.2026 00:00 in Finland
const END_OF_DAY = '2026-05-17T20:59:59.999Z' // 17.5.2026 23:59:59.999 in Finland

for (const zone of ['UTC', 'Europe/Helsinki', 'America/New_York', 'Asia/Tokyo']) {
  describeInTimeZone(zone, () => {
    describe('the day decoders', () => {
      it.each([
        ['a day key', '2026-06-01', '2026-06-01'],
        ['a Finnish midnight', SUMMER_MIDNIGHT, '2026-06-01'],
        ['the end of a Finnish day', END_OF_DAY, '2026-05-17'],
        ['an instant with an offset', '2026-06-01T00:00:00.000+03:00', '2026-06-01'],
      ])('reads %s as its Finnish day, however it is read', (_name, value, expected) => {
        expect(legacyDay(value)).toBe(expected)
        expect(storedDay(value)).toBe(expected)
        expect(requestDay(value)).toBe(expected)
      })

      it("reads Kennelliitto's stamp in a stored row, and refuses it in a request, which never sent one", () => {
        expect(legacyDay('2021-01-01T00:00:00')).toBe('2021-01-01')
        expect(storedDay('2021-01-01T00:00:00')).toBe('2021-01-01')
        expect(requestDay('2021-01-01T00:00:00')).toBeUndefined()
      })

      it.each([
        ["Kennelliitto's empty date", '0001-01-01T00:00:00'],
        ['an empty value', ''],
        ['text', 'tomorrow'],
        ['a day the month does not have', '2026-02-30'],
        ['no text at all', 42],
      ])('reads %s as no day', (_name, value) => {
        expect(legacyDay(value)).toBeUndefined()
        expect(storedDay(value)).toBeUndefined()
        expect(requestDay(value)).toBeUndefined()
      })
    })
  })
}

describe('rekeyEventDays', () => {
  const storedEvent = (): Partial<JsonDogEvent> => ({
    classes: [
      { class: 'ALO', date: beforeDayKeys(SUMMER_MIDNIGHT) },
      { class: 'AVO', date: '2026-06-02' },
    ],
    dates: [{ date: beforeDayKeys(SUMMER_MIDNIGHT), time: 'ap' }],
    endDate: beforeDayKeys('2026-06-01T21:00:00.000Z'),
    entryEndDate: beforeDayKeys(END_OF_DAY),
    entryOrigEndDate: beforeDayKeys('2026-05-10T20:59:59.999Z'),
    entryStartDate: beforeDayKeys(WINTER_MIDNIGHT),
    kcEvent: {
      classes: [],
      endDate: beforeDayKeys('2026-06-01T21:00:00.000Z'),
      eventType: 'NOME-B',
      startDate: beforeDayKeys(SUMMER_MIDNIGHT),
    },
    qualificationStartDate: beforeDayKeys('2025-08-18T21:00:00.000Z'),
    resultsPublished: { ALO: [SUMMER_MIDNIGHT], AVO: true },
    startDate: beforeDayKeys(SUMMER_MIDNIGHT),
    startNumbersPublished: ['2026-06-01/ap', '2026-06-01T21:00:00.000Z'],
    stations: [{ date: beforeDayKeys(SUMMER_MIDNIGHT), id: 'post-1', number: 1, tasks: 1 }],
  })

  it('writes every day of the event as the key of its Finnish day', () => {
    const event = storedEvent()

    expect(rekeyEventDays(event, legacyDay)).toEqual({ changed: true, unreadable: false })
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
    rekeyEventDays(event, legacyDay)
    const once = structuredClone(event)

    expect(rekeyEventDays(event, legacyDay)).toEqual({ changed: false, unreadable: false })
    expect(event).toEqual(once)
  })

  it('leaves a day it cannot read as it is and says so', () => {
    const event: Partial<JsonDogEvent> = {
      endDate: beforeDayKeys(SUMMER_MIDNIGHT),
      resultsPublished: ['not-a-dayTx'],
      startDate: beforeDayKeys('not-a-date'),
    }

    expect(rekeyEventDays(event, legacyDay)).toEqual({ changed: true, unreadable: true })
    expect(event).toEqual({ endDate: '2026-06-01', resultsPublished: ['not-a-dayTx'], startDate: 'not-a-date' })
  })

  it('takes a patch, whose deleted fields are null and whose lists may hold null', () => {
    const patch: Patch<JsonDogEvent> = {
      classes: [null, { class: 'ALO', date: beforeDayKeys(SUMMER_MIDNIGHT) }],
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
    dates: [{ date: beforeDayKeys(SUMMER_MIDNIGHT), time: 'ap' }],
    dog: {
      // A browser's local noon of the birth day, as the JSON reviver made of a bare day (KOE-1131).
      dob: beforeDayKeys('2021-01-01T10:00:00.000Z'),
      regNo: 'FI1/21',
      results: [
        {
          class: 'ALO',
          date: beforeDayKeys('2025-06-01T00:00:00'),
          judge: 'J',
          location: 'L',
          result: 'ALO1',
          type: 'NOME-B',
        },
      ],
    },
    // An older copy keyed the start by the UTC day (KOE-1541).
    group: { date: beforeDayKeys(SUMMER_MIDNIGHT), key: '2026-05-31-ap', number: 1, time: 'ap' },
    qualifyingResults: [
      {
        class: 'ALO',
        date: beforeDayKeys('0001-01-01T00:00:00'),
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
        date: beforeDayKeys('2025-05-31T21:00:00.000Z'),
        id: 'm1',
        judge: 'J',
        location: 'L',
        result: 'ALO1',
        type: 'NOME-B',
      },
    ],
    startGroup: { date: beforeDayKeys(SUMMER_MIDNIGHT), key: '2026-05-31-ap', number: 1, time: 'ap' },
  })

  it("writes the entry's days, its starts' keys and the dog's dates as keys", () => {
    const registration = storedRegistration()

    expect(rekeyRegistrationDays(registration, legacyDay)).toEqual({ changed: true, unreadable: false })
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

  it('leaves a registration whose days are keys as it is', () => {
    const registration = storedRegistration()
    rekeyRegistrationDays(registration, legacyDay)

    expect(rekeyRegistrationDays(registration, legacyDay)).toEqual({ changed: false, unreadable: false })
  })

  it.each([
    ['the reserve', 'reserve'],
    ['the cancelled list', 'cancelled'],
  ])('keeps the key of %s, which names no day', (_name, key) => {
    const registration: Partial<JsonRegistration> = {
      group: { date: beforeDayKeys(SUMMER_MIDNIGHT), key, number: 3, time: 'ap' },
    }

    rekeyRegistrationDays(registration, legacyDay)

    expect(registration.group).toEqual({ date: '2026-06-01', key, number: 3, time: 'ap' })
  })

  it("removes a birth date that is Kennelliitto's empty date, and keeps one it cannot read", () => {
    const empty: Partial<JsonRegistration> = {
      dog: { dob: beforeDayKeys('0000-12-31T22:00:00.000Z'), regNo: 'FI1/21' },
    }
    const unreadable: Partial<JsonRegistration> = { dog: { dob: beforeDayKeys('31.12.2020'), regNo: 'FI1/21' } }

    expect(rekeyRegistrationDays(empty, legacyDay)).toEqual({ changed: true, unreadable: false })
    expect(empty.dog).toEqual({ regNo: 'FI1/21' })
    expect(rekeyRegistrationDays(unreadable, legacyDay)).toEqual({ changed: false, unreadable: true })
    expect(unreadable.dog).toEqual({ dob: '31.12.2020', regNo: 'FI1/21' })
  })

  it('leaves a group whose day it cannot read, and its key, as they are', () => {
    const registration: Partial<JsonRegistration> = {
      group: { date: beforeDayKeys('eilen'), key: 'stored', number: 1, time: 'ap' },
    }

    expect(rekeyRegistrationDays(registration, legacyDay)).toEqual({ changed: false, unreadable: true })
    expect(registration.group).toEqual({ date: 'eilen', key: 'stored', number: 1, time: 'ap' })
  })
})

describe('rekeyDogDays', () => {
  it("writes the dog's birth date and results' days as keys", () => {
    const dog: JsonDog = {
      dob: beforeDayKeys('2021-01-01T00:00:00'),
      regNo: 'FI1/21',
      results: [
        {
          class: 'ALO',
          date: beforeDayKeys('2025-06-01T00:00:00'),
          judge: 'J',
          location: 'L',
          result: 'ALO1',
          type: 'NOME-B',
        },
        { class: 'AVO', date: '', judge: 'J', location: 'L', result: 'AVO1', type: 'NOME-B' },
      ],
    }

    expect(rekeyDogDays(dog, legacyDay)).toEqual({ changed: true, unreadable: false })
    expect(dog.dob).toBe('2021-01-01')
    expect(dog.results?.map(({ date }) => date)).toEqual(['2025-06-01', ''])
  })
})

describe('withRegistrationDayKeys', () => {
  it('answers a copy with the days as keys and leaves the registration as it was', () => {
    const registration: Partial<JsonRegistration> = { dates: [{ date: beforeDayKeys(SUMMER_MIDNIGHT), time: 'ap' }] }

    expect(withRegistrationDayKeys(registration)).toEqual({ dates: [{ date: '2026-06-01', time: 'ap' }] })
    expect(registration).toEqual({ dates: [{ date: SUMMER_MIDNIGHT, time: 'ap' }] })
  })
})
