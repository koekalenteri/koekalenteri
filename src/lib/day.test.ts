import type { DayKey } from '../types'
import { differenceInMonths } from 'date-fns/differenceInMonths'
import { describeInTimeZone } from '../test-utils/timeZone'
import {
  addDays,
  addMonths,
  calendarDayOf,
  dayEnd,
  dayEndOf,
  dayOf,
  dayOfWeek,
  dayParts,
  dayStart,
  dayStartOf,
  daysBetween,
  eachDay,
  hasCalendarDay,
  hasLocalDay,
  isDayKey,
  isInstantString,
  latestDayMonthsBefore,
  legacyStoredDay,
  legacyStoredEventDay,
  localCalendarDayOf,
  localDateOf,
  localDayOf,
  monthKeyOf,
  monthsBetween,
  pickedDayOf,
  sameDay,
  shiftDays,
  storedEventDayOf,
  TIME_ZONE,
  toDayKey,
  yearEnd,
  yearOf,
  yearStart,
} from './day'

/** The zones the machine running the tests may be in; the module's answers must not depend on it. */
const HOST_ZONES = ['UTC', 'Europe/Helsinki', 'America/New_York', 'Asia/Tokyo']

const instant = (iso: string) => new Date(iso)

/**
 * Finland leaves winter time on 29.3.2026 (03:00 EET becomes 04:00 EEST, 01:00Z) and comes back
 * on 25.10.2026 (04:00 EEST becomes 03:00 EET, 01:00Z): the first day has 23 hours, the second 25.
 * New York changes on 8.3.2026 and 1.11.2026 (07:00Z and 06:00Z). Tokyo never does.
 */
const DAY_BOUNDS: Array<{ day: DayKey; zone: string; start: string; end: string; hours: number }> = [
  {
    day: toDayKey(2026, 3, 29),
    end: '2026-03-29T20:59:59.999Z',
    hours: 23,
    start: '2026-03-28T22:00:00.000Z',
    zone: TIME_ZONE,
  },
  {
    day: toDayKey(2026, 10, 25),
    end: '2026-10-25T21:59:59.999Z',
    hours: 25,
    start: '2026-10-24T21:00:00.000Z',
    zone: TIME_ZONE,
  },
  {
    day: toDayKey(2026, 10, 17),
    end: '2026-10-17T20:59:59.999Z',
    hours: 24,
    start: '2026-10-16T21:00:00.000Z',
    zone: TIME_ZONE,
  },
  {
    day: toDayKey(2026, 1, 15),
    end: '2026-01-15T21:59:59.999Z',
    hours: 24,
    start: '2026-01-14T22:00:00.000Z',
    zone: TIME_ZONE,
  },
  {
    day: toDayKey(2026, 3, 29),
    end: '2026-03-29T23:59:59.999Z',
    hours: 24,
    start: '2026-03-29T00:00:00.000Z',
    zone: 'UTC',
  },
  {
    day: toDayKey(2026, 10, 25),
    end: '2026-10-25T23:59:59.999Z',
    hours: 24,
    start: '2026-10-25T00:00:00.000Z',
    zone: 'UTC',
  },
  {
    day: toDayKey(2026, 3, 29),
    end: '2026-03-30T03:59:59.999Z',
    hours: 24,
    start: '2026-03-29T04:00:00.000Z',
    zone: 'America/New_York',
  },
  {
    day: toDayKey(2026, 10, 25),
    end: '2026-10-26T03:59:59.999Z',
    hours: 24,
    start: '2026-10-25T04:00:00.000Z',
    zone: 'America/New_York',
  },
  {
    day: toDayKey(2026, 3, 8),
    end: '2026-03-09T03:59:59.999Z',
    hours: 23,
    start: '2026-03-08T05:00:00.000Z',
    zone: 'America/New_York',
  },
  {
    day: toDayKey(2026, 11, 1),
    end: '2026-11-02T04:59:59.999Z',
    hours: 25,
    start: '2026-11-01T04:00:00.000Z',
    zone: 'America/New_York',
  },
  {
    day: toDayKey(2026, 3, 29),
    end: '2026-03-29T14:59:59.999Z',
    hours: 24,
    start: '2026-03-28T15:00:00.000Z',
    zone: 'Asia/Tokyo',
  },
  {
    day: toDayKey(2026, 10, 25),
    end: '2026-10-25T14:59:59.999Z',
    hours: 24,
    start: '2026-10-24T15:00:00.000Z',
    zone: 'Asia/Tokyo',
  },
]

for (const hostZone of HOST_ZONES) {
  describeInTimeZone(hostZone, () => {
    describe('dayStart and dayEnd', () => {
      it.each(DAY_BOUNDS)('bound $day in $zone, a day of $hours hours', ({ day, zone, start, end, hours }) => {
        expect(dayStart(day, zone).toISOString()).toBe(start)
        expect(dayEnd(day, zone).toISOString()).toBe(end)
        expect(dayEnd(day, zone).getTime() - dayStart(day, zone).getTime() + 1).toBe(hours * 3_600_000)
      })

      it('returns plain Dates, so the stored form is the UTC instant', () => {
        expect(dayStart(toDayKey(2026, 10, 25), TIME_ZONE).constructor).toBe(Date)
        expect(dayEnd(toDayKey(2026, 10, 25), TIME_ZONE).constructor).toBe(Date)
      })
    })

    describe('dayOf', () => {
      it.each([
        // The same moment is one day east of Finland and another west of it.
        { expected: '2026-03-29', iso: '2026-03-28T22:00:00.000Z', zone: TIME_ZONE },
        { expected: '2026-03-28', iso: '2026-03-28T22:00:00.000Z', zone: 'UTC' },
        { expected: '2026-03-28', iso: '2026-03-28T22:00:00.000Z', zone: 'America/New_York' },
        { expected: '2026-03-29', iso: '2026-03-28T22:00:00.000Z', zone: 'Asia/Tokyo' },
        // The last millisecond of a Finnish day and the first of the next, on both changes of time.
        { expected: '2026-03-28', iso: '2026-03-28T21:59:59.999Z', zone: TIME_ZONE },
        { expected: '2026-03-29', iso: '2026-03-29T20:59:59.999Z', zone: TIME_ZONE },
        { expected: '2026-03-30', iso: '2026-03-29T21:00:00.000Z', zone: TIME_ZONE },
        { expected: '2026-10-25', iso: '2026-10-24T21:00:00.000Z', zone: TIME_ZONE },
        { expected: '2026-10-25', iso: '2026-10-25T21:59:59.999Z', zone: TIME_ZONE },
        { expected: '2026-10-26', iso: '2026-10-25T22:00:00.000Z', zone: TIME_ZONE },
        // Inside the hour that is skipped in spring and the hour that happens twice in autumn.
        { expected: '2026-03-29', iso: '2026-03-29T01:30:00.000Z', zone: TIME_ZONE },
        { expected: '2026-10-25', iso: '2026-10-25T01:30:00.000Z', zone: TIME_ZONE },
        // 23:30 in Finland is the next morning in Tokyo and the afternoon in New York.
        { expected: '2026-10-26', iso: '2026-10-25T21:30:00.000Z', zone: 'Asia/Tokyo' },
        { expected: '2026-10-25', iso: '2026-10-25T21:30:00.000Z', zone: 'America/New_York' },
      ])('reads $iso as $expected in $zone', ({ expected, iso, zone }) => {
        expect(dayOf(instant(iso), zone)).toBe(expected)
      })

      it('takes a timestamp as well as a Date', () => {
        expect(dayOf(Date.parse('2026-10-25T21:59:59.999Z'), TIME_ZONE)).toBe('2026-10-25')
      })

      it('is the inverse of dayStart and dayEnd on every bound', () => {
        for (const { day, zone } of DAY_BOUNDS) {
          expect(dayOf(dayStart(day, zone), zone)).toBe(day)
          expect(dayOf(dayEnd(day, zone), zone)).toBe(day)
        }
      })

      // Santiago's clocks go forward at midnight (6.9.2026 starts at 01:00), Havana's too (8.3.2026):
      // the day has no 00:00 and starts at the first moment the zone has.
      it.each([
        { day: '2026-09-06', start: '2026-09-06T04:00:00.000Z', zone: 'America/Santiago' },
        { day: '2026-03-08', start: '2026-03-08T05:00:00.000Z', zone: 'America/Havana' },
      ] satisfies Array<{ day: DayKey; start: string; zone: string }>)(
        'round-trips $day in $zone, where the change of time falls on midnight',
        ({ day, start, zone }) => {
          expect(dayStart(day, zone).toISOString()).toBe(start)
          expect(dayOf(dayStart(day, zone), zone)).toBe(day)
          expect(dayOf(dayEnd(day, zone), zone)).toBe(day)
          expect(dayEnd(day, zone).getTime() - dayStart(day, zone).getTime() + 1).toBe(23 * 3_600_000)
        }
      )

      it('refuses an invalid instant rather than name a day for it', () => {
        expect(() => dayOf(new Date(Number.NaN), TIME_ZONE)).toThrow(RangeError)
      })
    })

    describe('addDays', () => {
      it.each([
        { days: 1, expected: '2026-03-29', from: '2026-03-28' },
        { days: 1, expected: '2026-03-30', from: '2026-03-29' },
        { days: 1, expected: '2026-10-26', from: '2026-10-25' },
        { days: -1, expected: '2026-10-24', from: '2026-10-25' },
        { days: 0, expected: '2026-10-25', from: '2026-10-25' },
        { days: 1, expected: '2026-03-01', from: '2026-02-28' },
        { days: 1, expected: '2024-02-29', from: '2024-02-28' },
        { days: -1, expected: '2026-02-28', from: '2026-03-01' },
        { days: 1, expected: '2027-01-01', from: '2026-12-31' },
        { days: 90, expected: '2026-05-15', from: '2026-02-14' },
        { days: -90, expected: '2026-02-14', from: '2026-05-15' },
      ] satisfies Array<{ days: number; expected: DayKey; from: DayKey }>)(
        '$from + $days days is $expected',
        ({ days, expected, from }) => {
          expect(addDays(from, days)).toBe(expected)
        }
      )
    })

    describe('addMonths', () => {
      it.each([
        { expected: '2026-02-28', from: '2026-01-31', months: 1 },
        { expected: '2026-04-25', from: '2026-10-25', months: -6 },
        { expected: '2025-02-28', from: '2024-02-29', months: 12 },
        { expected: '2027-01-15', from: '2026-12-15', months: 1 },
        { expected: '2024-06-07', from: '2026-06-07', months: -24 },
      ] satisfies Array<{ expected: DayKey; from: DayKey; months: number }>)(
        '$from + $months months is $expected, clamped to the month',
        ({ expected, from, months }) => {
          expect(addMonths(from, months)).toBe(expected)
        }
      )
    })

    describe('daysBetween', () => {
      it.each([
        { expected: 0, from: '2026-03-26', to: '2026-03-26' },
        { expected: 2, from: '2026-03-28', to: '2026-03-30' },
        { expected: 2, from: '2026-10-24', to: '2026-10-26' },
        { expected: -2, from: '2026-10-26', to: '2026-10-24' },
        { expected: 1, from: '2025-12-31', to: '2026-01-01' },
        { expected: 77, from: '2026-03-27', to: '2026-06-12' },
        { expected: 90, from: '2026-02-14', to: '2026-05-15' },
        { expected: 169, from: '2026-05-14', to: '2026-10-30' },
      ] satisfies Array<{ expected: number; from: DayKey; to: DayKey }>)(
        'from $from to $to is $expected whole days',
        ({ expected, from, to }) => {
          expect(daysBetween(from, to)).toBe(expected)
        }
      )
    })

    describe('eachDay', () => {
      it('lists the days from the first to the last, both included, over a change of time', () => {
        expect(eachDay(toDayKey(2026, 3, 28), toDayKey(2026, 3, 30))).toEqual([
          '2026-03-28',
          '2026-03-29',
          '2026-03-30',
        ])
        expect(eachDay(toDayKey(2026, 10, 24), toDayKey(2026, 10, 26))).toEqual([
          '2026-10-24',
          '2026-10-25',
          '2026-10-26',
        ])
      })

      it('is one day for a one-day span and empty for a span that ends before it starts', () => {
        expect(eachDay(toDayKey(2026, 10, 25), toDayKey(2026, 10, 25))).toEqual(['2026-10-25'])
        expect(eachDay(toDayKey(2026, 10, 26), toDayKey(2026, 10, 25))).toEqual([])
      })
    })

    describe('dayOfWeek', () => {
      it.each([
        { day: '2026-10-17', expected: 6, name: 'Saturday' },
        { day: '2026-10-18', expected: 0, name: 'Sunday' },
        { day: '2026-03-29', expected: 0, name: 'the Sunday the clocks go forward' },
        { day: '2026-10-25', expected: 0, name: 'the Sunday the clocks go back' },
        { day: '2027-01-15', expected: 5, name: 'Friday' },
      ] satisfies Array<{ day: DayKey; expected: number; name: string }>)('$day is $name', ({ day, expected }) => {
        expect(dayOfWeek(day)).toBe(expected)
      })
    })

    describe('dayParts', () => {
      it('splits the key into its numbers', () => {
        expect(dayParts(toDayKey(2026, 3, 9))).toEqual({ day: 9, month: 3, year: 2026 })
      })
    })

    describe('shiftDays', () => {
      it.each([
        { days: 0, expected: '2026-03-26T22:00:00.000Z', from: '2026-03-26T22:00:00.000Z', name: 'zero days' },
        { days: 169, expected: '2026-10-30T22:00:00.000Z', from: '2026-05-14T21:00:00.000Z', name: 'into winter time' },
        { days: 90, expected: '2026-05-15T21:00:00.000Z', from: '2026-02-14T22:00:00.000Z', name: 'into summer time' },
        {
          days: -1,
          expected: '2026-03-28T22:00:00.000Z',
          from: '2026-03-29T21:00:00.000Z',
          name: 'backwards over the change',
        },
        {
          days: 1,
          expected: '2026-03-29T20:59:59.999Z',
          from: '2026-03-28T21:59:59.999Z',
          name: 'the end of a day onto the 23-hour day',
        },
        {
          days: 1,
          expected: '2026-10-25T21:59:59.999Z',
          from: '2026-10-24T20:59:59.999Z',
          name: 'the end of a day onto the 25-hour day',
        },
      ])('keeps the Finnish wall clock: $name', ({ days, expected, from }) => {
        const shifted = shiftDays(instant(from), days, TIME_ZONE)
        expect(shifted.toISOString()).toBe(expected)
        expect(shifted.constructor).toBe(Date)
      })

      it('keeps the wall clock of another zone when asked to', () => {
        // 18:00 in New York the evening before its clocks go forward, moved a day: still 18:00.
        expect(shiftDays(instant('2026-03-07T23:00:00.000Z'), 1, 'America/New_York').toISOString()).toBe(
          '2026-03-08T22:00:00.000Z'
        )
      })
    })
  })
}

describe('isDayKey', () => {
  it.each(['2026-10-17', '2026-03-29', '2024-02-29', '1977-01-01'])('accepts %s', (value) => {
    expect(isDayKey(value)).toBe(true)
  })

  it.each([
    ['an instant', '2026-10-17T00:00:00.000Z'],
    ['an unpadded month and day', '2026-1-7'],
    ['a day the month does not have', '2026-02-30'],
    ['a thirteenth month', '2026-13-01'],
    ['a leap day in a common year', '2026-02-29'],
    ["the Kennel Club's empty date, before the calendar's years", '0001-01-01'],
    ['a number', 20261017],
    ['a Date', new Date('2026-10-17T00:00:00Z')],
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
  ])('rejects %s', (_name, value) => {
    expect(isDayKey(value)).toBe(false)
  })
})

describe('toDayKey', () => {
  it('pads the month and the day', () => {
    expect(toDayKey(2026, 3, 9)).toBe('2026-03-09')
  })

  it('builds a key the guard accepts', () => {
    expect(isDayKey(toDayKey(2024, 2, 29))).toBe(true)
  })

  it.each([
    ['a day the month does not have', 2026, 2, 30],
    ['a thirteenth month', 2026, 13, 1],
    ['a zero day', 2026, 10, 0],
    ['a fractional day', 2026, 10, 1.5],
    ['a year of fewer than four digits', 999, 1, 1],
  ])('refuses %s', (_name, year, month, day) => {
    expect(() => toDayKey(year, month, day)).toThrow(RangeError)
  })

  it('sorts and compares as text, oldest first', () => {
    const days = [toDayKey(2026, 10, 25), toDayKey(2026, 3, 29), toDayKey(2025, 12, 31)]
    expect([...days].sort((a, b) => a.localeCompare(b))).toEqual(['2025-12-31', '2026-03-29', '2026-10-25'])
    expect(toDayKey(2026, 3, 29) < toDayKey(2026, 10, 25)).toBe(true)
  })
})

describe('hasCalendarDay', () => {
  it.each([
    { expected: true, instant: new Date('2026-10-17T12:00:00.000Z'), name: 'a day of the trials' },
    { expected: true, instant: new Date('1100-01-01T12:00:00.000Z'), name: 'the first accepted year' },
    { expected: true, instant: new Date('9899-12-31T12:00:00.000Z'), name: 'the last accepted year' },
    {
      expected: false,
      instant: new Date('1050-06-01T12:00:00.000Z'),
      name: 'a year a key spells but no reader accepts',
    },
    { expected: false, instant: new Date('9999-12-31T12:00:00.000Z'), name: 'the last year a key spells' },
    { expected: false, instant: new Date('+010000-01-01T00:00:00Z'), name: 'a five-digit year' },
    { expected: false, instant: new Date('0001-01-01T00:00:00'), name: "the Kennel Club's empty date" },
    { expected: false, instant: new Date('0500-06-01T00:00:00.000Z'), name: 'a year below 1000' },
    { expected: false, instant: new Date(Number.NaN), name: 'an invalid Date' },
  ])('is $expected for $name', ({ expected, instant }) => {
    expect(hasCalendarDay(instant, TIME_ZONE)).toBe(expected)
  })
})

describe('the readers of an instant', () => {
  // 23:30 on 31.12.2025 in Finland is 21:30Z: another year and month in UTC and New York.
  const lastMoments = new Date('2025-12-31T21:30:00.000Z')

  it('dayStartOf and dayEndOf bound the day the instant falls on in the zone', () => {
    expect(dayStartOf(lastMoments, TIME_ZONE).toISOString()).toBe('2025-12-30T22:00:00.000Z')
    expect(dayEndOf(lastMoments, TIME_ZONE).toISOString()).toBe('2025-12-31T21:59:59.999Z')
    expect(dayStartOf(lastMoments, 'UTC').toISOString()).toBe('2025-12-31T00:00:00.000Z')
    expect(dayEndOf(lastMoments, 'America/New_York').toISOString()).toBe('2026-01-01T04:59:59.999Z')
  })

  it('dayStartOf counts whole days from the day the instant falls on', () => {
    // Over the change to summer time: 28.3. 23:30 Finnish time plus one day starts at 29.3. 00:00 (+02:00).
    expect(dayStartOf(new Date('2026-03-28T21:30:00.000Z'), TIME_ZONE, 1).toISOString()).toBe(
      '2026-03-28T22:00:00.000Z'
    )
    expect(dayStartOf(new Date('2026-03-28T21:30:00.000Z'), TIME_ZONE, 2).toISOString()).toBe(
      '2026-03-29T21:00:00.000Z'
    )
  })

  it('dayEnd ends the last day a key can spell, and every step from an accepted day lands on a key', () => {
    expect(dayEnd('9999-12-31', TIME_ZONE).toISOString()).toBe('9999-12-31T21:59:59.999Z')
    expect(addDays('9899-12-31', 7)).toBe('9900-01-07')
    expect(addMonths('1100-01-01', -24)).toBe('1098-01-01')
    expect(isDayKey('9999-12-31')).toBe(false)
  })

  it('yearStart and yearEnd bound the year in the zone', () => {
    expect(yearStart(2026, TIME_ZONE).toISOString()).toBe('2025-12-31T22:00:00.000Z')
    expect(yearEnd(2026, TIME_ZONE).toISOString()).toBe('2026-12-31T21:59:59.999Z')
  })

  it('sameDay compares the days in the zone', () => {
    const newYear = new Date('2025-12-31T22:30:00.000Z')
    expect(sameDay(lastMoments, newYear, TIME_ZONE)).toBe(false)
    expect(sameDay(lastMoments, newYear, 'UTC')).toBe(true)
  })

  it('yearOf reads the year in the zone', () => {
    expect(yearOf(lastMoments, TIME_ZONE)).toBe(2025)
    expect(yearOf(new Date('2025-12-31T22:30:00.000Z'), TIME_ZONE)).toBe(2026)
    expect(yearOf(lastMoments, 'America/New_York')).toBe(2025)
  })

  it("monthKeyOf is a day's yyyy-MM", () => {
    expect(monthKeyOf('2026-01-01')).toBe('2026-01')
    expect(monthKeyOf(dayOf(new Date('2025-12-31T22:30:00.000Z'), TIME_ZONE))).toBe('2026-01')
  })
})

describe('isInstantString', () => {
  it.each(['2016-09-18T17:34:02.666Z', '2021-05-10T09:05:12.000Z', '2018-06-19T04:06Z', '2026-06-28T00:00:00+03:00'])(
    'accepts %s',
    (value) => {
      expect(isInstantString(value)).toBe(true)
    }
  )

  it.each([
    ['a day the month does not have', '2026-04-31T00:00:00.000Z'],
    ['the 30th of February', '2026-02-30T00:00:00Z'],
    ['a stamp without a zone', '2026-06-28T00:00'],
    ['a stamp without a zone, with seconds', '2026-06-28T00:00:00'],
    ['a bare day', '2026-06-28'],
    ['an hour 24', '2021-01-10T24:05:12.000Z'],
    ['a minute 70', '2021-01-10T23:70:12.000Z'],
    ['a second 70', '2021-01-10T23:00:70.000Z'],
    ['a thirteenth month', '2021-13-10T09:05:12.000Z'],
    ['a day 32', '2021-11-32T09:05:12.000Z'],
    ['a zone hour 24', '2021-01-10T09:05:12+24:00'],
    ['a zone minute 60', '2021-01-10T09:05:12+03:60'],
    ['an empty string', ''],
    ['null', null],
    ['two Ts', '2021-01-10T23:00T00Z'],
    ["the Kennel Club's empty date", '0001-01-01T00:00:00.000Z'],
    ['a number', 12],
    ['a Date', new Date()],
  ])('rejects %s', (_name, value) => {
    expect(isInstantString(value)).toBe(false)
  })
})

describe('TIME_ZONE', () => {
  it("is the trials' zone", () => {
    expect(TIME_ZONE).toBe('Europe/Helsinki')
  })
})

describe('monthsBetween', () => {
  it.each<[DayKey, DayKey, number]>([
    ['2025-12-28', '2026-09-28', 9],
    ['2025-12-28', '2026-09-27', 8],
    ['2025-12-29', '2026-09-28', 8],
    ['2026-01-01', '2026-01-01', 0],
    // A month without the starting date ends on its last day.
    ['2025-07-31', '2026-04-30', 9],
    ['2025-07-31', '2026-04-29', 8],
    ['2026-01-31', '2026-02-28', 1],
    ['2024-01-31', '2024-02-28', 0],
    ['2024-01-31', '2024-02-29', 1],
    // A leap February's 28th is not its last day.
    ['2023-05-29', '2024-02-28', 8],
    ['2023-05-29', '2024-02-29', 9],
    ['2024-02-29', '2025-02-28', 12],
    // A day after `to` is never any number of months before it.
    ['2026-01-02', '2026-01-01', -1],
    ['2026-03-01', '2026-01-31', -2],
    ['2026-01-31', '2025-12-31', -1],
  ])('from %s to %s is %i', (from, to, months) => {
    expect(monthsBetween(from, to)).toBe(months)
  })

  it('is the largest count whose addMonths step does not pass `to`', () => {
    const misses: string[] = []
    for (const from of eachDay('2023-01-01', '2024-12-31')) {
      for (let span = -70; span <= 470; span += 7) {
        const to = addDays(from, span)
        const months = monthsBetween(from, to)
        if (addMonths(from, months) > to || addMonths(from, months + 1) <= to) misses.push(`${from} ${to}`)
      }
    }
    expect(misses).toEqual([])
  })

  it('counts as date-fns differenceInMonths does, except where date-fns misses a month end', () => {
    const lastOfMonth = (day: DayKey) => addDays(day, 1).endsWith('-01')
    const unexplained: string[] = []
    let explained = 0
    for (const from of eachDay('2023-01-01', '2024-12-31')) {
      for (let span = 0; span <= 400; span++) {
        const to = addDays(from, span)
        const ours = monthsBetween(from, to)
        const theirs = differenceInMonths(localDateOf(to), localDateOf(from))
        if (ours === theirs) continue
        const fromDate = dayParts(from).day
        const { day: toDate, month: toMonth } = dayParts(to)
        // date-fns does not count a month reached on the last day of a shorter month (31.7. to 30.4.)...
        const shortMonthEnd = ours === theirs + 1 && lastOfMonth(to) && toDate < fromDate
        // ...and counts a leap February's 28th as its last day (29.5. to 28.2.).
        const leapFebruary28 = ours === theirs - 1 && toMonth === 2 && toDate === 28 && !lastOfMonth(to)
        if (shortMonthEnd || leapFebruary28) explained++
        else unexplained.push(`${from} ${to}: ${ours} vs ${theirs}`)
      }
    }
    expect(unexplained).toEqual([])
    expect(explained).toBeGreaterThan(0)
  })
})

describe('latestDayMonthsBefore', () => {
  it.each<[DayKey, number, DayKey]>([
    ['2026-09-28', 9, '2025-12-28'],
    ['2026-09-30', 9, '2025-12-31'],
    ['2026-04-30', 9, '2025-07-31'],
    ['2026-04-29', 9, '2025-07-29'],
    ['2024-02-28', 9, '2023-05-28'],
    ['2024-02-29', 9, '2023-05-31'],
    ['2025-02-28', 9, '2024-05-31'],
    ['2026-05-31', 3, '2026-02-28'],
    ['2026-01-15', 0, '2026-01-15'],
  ])('by %s, %i months have passed from %s at the latest', (day, months, latest) => {
    expect(latestDayMonthsBefore(day, months)).toBe(latest)
  })

  it('is the last day from which monthsBetween reaches the count, zero months included', () => {
    const misses: string[] = []
    for (const day of eachDay('2023-01-01', '2024-12-31')) {
      for (const months of [0, 1, 9, 12]) {
        const latest = latestDayMonthsBefore(day, months)
        for (let offset = -40; offset <= 40; offset++) {
          const from = addDays(latest, offset)
          if (monthsBetween(from, day) >= months !== from <= latest) misses.push(`${day} ${months} ${from}`)
        }
      }
    }
    expect(misses).toEqual([])
  })
})

for (const hostZone of HOST_ZONES) {
  describeInTimeZone(hostZone, () => {
    describe("the browser's day", () => {
      it('reads a local midnight as its own day, 1.1. as 1.1.', () => {
        expect(localDayOf(new Date('2026-01-01T00:00:00'))).toBe('2026-01-01')
        expect(localDayOf(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
      })

      it('builds the local midnight a picker shows as the day', () => {
        const date = localDateOf('2026-02-28')
        expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 1, 28, 0])
        expect(localDayOf(date)).toBe('2026-02-28')
      })

      it.each([
        ['an Invalid Date', () => new Date(Number.NaN), false],
        ["Kennelliitto's empty date", () => new Date('0001-01-01T00:00:00'), false],
        ['a typed year 202', () => new Date('0202-01-01T00:00:00'), false],
        ['year 1000', () => new Date('1000-01-01T00:00:00'), true],
        ['year 9999', () => new Date('9999-12-31T00:00:00'), true],
        ['a birth date', () => new Date('2025-12-28T00:00:00'), true],
      ])('%s has a day: %s', (_name, date, expected) => {
        expect(hasLocalDay(date())).toBe(expected)
      })
    })
  })
}

// An event's or an entry's day stored as an instant (KOE-1547): the start or the end of the day, some
// an hour off, read as the day it was stored for, in every host zone.
for (const hostZone of HOST_ZONES) {
  describeInTimeZone(hostZone, () => {
    describe('a stored event day', () => {
      it.each([
        ['an exact Finnish midnight', '2026-05-31T21:00:00.000Z', '2026-06-01'],
        [
          "a winter day's midnight worked out in summer time, 23:00 the evening before",
          '2026-11-06T21:00:00.000Z',
          '2026-11-07',
        ],
        ["a summer day's midnight worked out in winter time, 01:00", '2026-10-01T22:00:00.000Z', '2026-10-02'],
        ['a UTC midnight, 02:00 in winter', '2026-01-20T00:00:00.000Z', '2026-01-20'],
        ['an exact Finnish end of day', '2026-05-17T20:59:59.999Z', '2026-05-17'],
        ['an end of day an hour late, 00:59:59.999', '2026-09-27T21:59:59.999Z', '2026-09-27'],
        ['an end of day an hour early, 22:59:59.999', '2026-01-01T20:59:59.999Z', '2026-01-01'],
        // Further than an hour from every midnight, an instant is the day it falls on.
        ['noon', '2026-06-01T09:00:00.000Z', '2026-06-01'],
        ['22:30 the evening before', '2026-05-31T19:30:00.000Z', '2026-05-31'],
        ['an end of the hour at 15:59:59.999', '2026-06-01T12:59:59.999Z', '2026-06-01'],
      ])('reads %s as the day it was stored for', (_name, value, expected) => {
        expect(storedEventDayOf(new Date(value), TIME_ZONE)).toBe(expected)
        expect(legacyStoredEventDay(value, TIME_ZONE)).toBe(expected)
      })

      it.each([
        ["Kennelliitto's stamp", '2021-01-01T00:00:00', '2021-01-01'],
        ['a day key', '2021-01-01', '2021-01-01'],
      ])('reads %s as the day written on it', (_name, value, expected) => {
        expect(legacyStoredEventDay(value, TIME_ZONE)).toBe(expected)
      })

      it.each([
        ["Kennelliitto's empty date", '0001-01-01T00:00:00'],
        ['its empty date written by a browser in Finland', '0000-12-31T22:20:11.000Z'],
        ['a day the month does not have', '2021-02-30'],
        ['text', 'tomorrow'],
        ['no text', 42],
      ])('reads %s as no day', (_name, value) => {
        expect(legacyStoredEventDay(value, TIME_ZONE)).toBeUndefined()
      })
    })
  })
}

// The dog's dates in every form they were stored in (KOE-1548), read the same in every host zone.
for (const hostZone of HOST_ZONES) {
  describeInTimeZone(hostZone, () => {
    describe('a stored dog date', () => {
      it.each([
        ['a day key', '2021-01-01', '2021-01-01'],
        ["Kennelliitto's stamp", '2021-01-01T00:00:00', '2021-01-01'],
        ['a stamp with seconds and milliseconds', '2021-01-01T00:00:00.000', '2021-01-01'],
        ['a Finnish midnight a browser wrote', '2020-12-31T22:00:00.000Z', '2021-01-01'],
        // From KOE-1131 (29.3.2026) to KOE-1546 the browser's JSON reviver made a bare day its local noon.
        ['a Finnish noon a browser wrote', '2024-05-10T09:00:00.000Z', '2024-05-10'],
        ['a midnight a lambda wrote in UTC', '2024-01-01T00:00:00.000Z', '2024-01-01'],
        ['an instant with an offset', '2021-01-01T00:30:00+02:00', '2021-01-01'],
      ])('reads %s as its Finnish day', (_name, value, expected) => {
        expect(calendarDayOf(value, TIME_ZONE)).toBe(expected)
        // The migrations' own reading, which keeps every one of these forms (KOE-1547).
        expect(legacyStoredDay(value, TIME_ZONE)).toBe(expected)
      })

      it.each([
        ["Kennelliitto's empty date", '0001-01-01T00:00:00'],
        ['its empty date written by a lambda', '0001-01-01T00:00:00.000Z'],
        ['its empty date written by a browser in Finland', '0000-12-31T22:00:00.000Z'],
        ['an empty string', ''],
        ['a day the month does not have', '2021-02-30'],
        ['a stamp with a bad time', '2021-01-01T25:00:00'],
        ['a stamp with two times', '2021-01-01T00:00:00T01:00'],
        ['a stamp with a second time of one digit', '2021-01-01T00:00:00T9'],
        ['a day written the American way', '12/31/2021'],
        ['a day written out', 'March 7, 2021'],
        ['text', 'tomorrow'],
      ])('reads %s as no day, without throwing', (_name, value) => {
        expect(calendarDayOf(value, TIME_ZONE)).toBeUndefined()
        expect(localCalendarDayOf(value)).toBeUndefined()
        expect(legacyStoredDay(value, TIME_ZONE)).toBeUndefined()
      })

      // The empty date's instants are no instants of an accepted day to begin with; an instant whose own
      // date is accepted can still fall on a day in Finland that is not, and is no day either.
      it('reads an instant that falls outside the accepted years in Finland as no day', () => {
        expect(calendarDayOf('9899-12-31T23:00:00.000Z', TIME_ZONE)).toBeUndefined()
        expect(calendarDayOf('9899-12-31T20:00:00.000Z', TIME_ZONE)).toBe('9899-12-31')
      })

      it("reads an instant as the day it shows in the browser's zone for what this browser stored", () => {
        const midnight = new Date(2021, 0, 1)
        expect(localCalendarDayOf(midnight.toISOString())).toBe('2021-01-01')
        expect(localCalendarDayOf('2021-01-01T00:00:00')).toBe('2021-01-01')
      })
    })

    describe('the day a picker shows', () => {
      it.each([
        ['a local midnight', () => new Date(2021, 0, 1), '2021-01-01'],
        ['an Invalid Date', () => new Date(Number.NaN), undefined],
        ['a typed year 202', () => new Date('0202-01-01T00:00:00'), undefined],
        ['a year no key may hold', () => new Date('1050-01-01T00:00:00'), undefined],
      ])('is the day of %s', (_name, date, expected) => {
        expect(pickedDayOf(date())).toBe(expected)
      })
    })
  })
}
