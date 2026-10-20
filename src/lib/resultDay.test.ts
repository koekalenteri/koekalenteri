import { lastResultDay } from './resultDay'

describe('lib/resultDay', () => {
  describe('lastResultDay', () => {
    // 23:30 on 15.5.2026 in Finland, already the 16th in Tokyo: today is the Finnish day.
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-05-15T20:30:00.000Z'), toFake: ['Date'] }))
    afterEach(() => vi.useRealTimers())

    it('is today in Finland without a ranking period', () => {
      expect(lastResultDay(undefined)).toBe('2026-05-15')
    })

    // Past midnight in Finland, still the day before in UTC: today is the Finnish day.
    it.each([
      { expected: '2026-05-16', now: '2026-05-15T21:30:00.000Z' },
      { expected: '2027-01-01', now: '2026-12-31T22:30:00.000Z' },
    ])('is $expected at $now', ({ expected, now }) => {
      vi.setSystemTime(new Date(now))
      expect(lastResultDay(undefined)).toBe(expected)
    })

    it.each([
      { expected: '2026-05-12', last: '2026-05-12' },
      { expected: '2026-05-15', last: '2026-05-15' },
      { expected: '2026-05-15', last: '2026-06-30' },
    ] as const)('is $expected for a period whose last day is $last', ({ expected, last }) => {
      expect(lastResultDay(last)).toBe(expected)
    })
  })
})
