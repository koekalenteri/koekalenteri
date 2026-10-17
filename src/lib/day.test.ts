import type { DayKey } from '../types'
import { dayEndOf, dayStartOf, isDayKey, monthOf, sameDay, toDayKey, yearOf } from '../lib/day'
import { describeInTimeZone } from '../test-utils/timeZone'
import {
  addDays,
  addMonths,
  dayEnd,
  dayOf,
  dayOfWeek,
  dayParts,
  dayStart,
  daysBetween,
  eachDay,
  shiftDays,
  TIME_ZONE,
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

describe('the readers of an instant', () => {
  // 23:30 on 31.12.2025 in Finland is 21:30Z: another year and month in UTC and New York.
  const lastMoments = new Date('2025-12-31T21:30:00.000Z')

  it('dayStartOf and dayEndOf bound the day the instant falls on in the zone', () => {
    expect(dayStartOf(lastMoments, TIME_ZONE).toISOString()).toBe('2025-12-30T22:00:00.000Z')
    expect(dayEndOf(lastMoments, TIME_ZONE).toISOString()).toBe('2025-12-31T21:59:59.999Z')
    expect(dayStartOf(lastMoments, 'UTC').toISOString()).toBe('2025-12-31T00:00:00.000Z')
    expect(dayEndOf(lastMoments, 'America/New_York').toISOString()).toBe('2026-01-01T04:59:59.999Z')
  })

  it('sameDay compares the days in the zone', () => {
    const newYear = new Date('2025-12-31T22:30:00.000Z')
    expect(sameDay(lastMoments, newYear, TIME_ZONE)).toBe(false)
    expect(sameDay(lastMoments, newYear, 'UTC')).toBe(true)
  })

  it('yearOf and monthOf read the year and the month in the zone', () => {
    expect(yearOf(lastMoments, TIME_ZONE)).toBe(2025)
    expect(yearOf(new Date('2025-12-31T22:30:00.000Z'), TIME_ZONE)).toBe(2026)
    expect(yearOf(lastMoments, 'America/New_York')).toBe(2025)
    expect(monthOf(lastMoments, TIME_ZONE)).toBe('2025-12')
    expect(monthOf(new Date('2025-12-31T22:30:00.000Z'), TIME_ZONE)).toBe('2026-01')
  })
})

describe('TIME_ZONE', () => {
  it("is the trials' zone", () => {
    expect(TIME_ZONE).toBe('Europe/Helsinki')
  })
})
