import { describeInTimeZone } from '../test-utils/timeZone'
import { dayEnd, TIME_ZONE } from './day'
import { lastResultDay, manualResultDay, officialResultDay } from './resultDay'

describe('lib/resultDay', () => {
  // An official result's day is the one written on its zone-less stamp, a hand-entered one's its Finnish day.
  for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
    describeInTimeZone(zone, () => {
      it('reads the day written on an official result', () => {
        expect(officialResultDay(new Date('2026-01-01T00:00:00'))).toBe('2026-01-01')
        expect(officialResultDay(new Date('2025-12-31T23:59:59'))).toBe('2025-12-31')
      })

      it('reads a hand-entered result in Finnish time', () => {
        expect(manualResultDay(new Date('2025-12-31T22:00:00.000Z'))).toBe('2026-01-01')
        expect(manualResultDay(new Date('2025-12-31T21:59:59.999Z'))).toBe('2025-12-31')
      })
    })
  }

  describe('lastResultDay', () => {
    // 23:30 on 15.5.2026 in Finland, already the 16th in Tokyo: today is the Finnish day.
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-05-15T20:30:00.000Z'), toFake: ['Date'] }))
    afterEach(() => vi.useRealTimers())

    it('is today in Finland without a ranking period', () => {
      expect(lastResultDay(undefined)).toBe('2026-05-15')
    })

    it.each([
      { expected: '2026-05-12', periodEnd: dayEnd('2026-05-12', TIME_ZONE) },
      { expected: '2026-05-15', periodEnd: dayEnd('2026-05-15', TIME_ZONE) },
      { expected: '2026-05-15', periodEnd: dayEnd('2026-06-30', TIME_ZONE) },
    ])('is $expected for a period that ends at $periodEnd', ({ expected, periodEnd }) => {
      expect(lastResultDay(periodEnd)).toBe(expected)
    })
  })

  it.each([
    { date: new Date('0001-01-01T00:00:00'), name: "the Kennel Club's empty date" },
    { date: new Date(Number.NaN), name: 'an invalid date' },
  ])('gives no day for $name', ({ date }) => {
    expect(officialResultDay(date)).toBeUndefined()
    expect(manualResultDay(date)).toBeUndefined()
  })
})
