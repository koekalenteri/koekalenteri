import { dayEnd, TIME_ZONE } from './day'
import { lastResultDay } from './resultDay'

describe('lib/resultDay', () => {
  describe('lastResultDay', () => {
    // 23:30 on 15.5.2026 in Finland, already the 16th in Tokyo: today is the Finnish day.
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-05-15T20:30:00.000Z'), toFake: ['Date'] }))
    afterEach(() => vi.useRealTimers())

    it('is today in Finland without a ranking period', () => {
      expect(lastResultDay(undefined)).toBe('2026-05-15')
    })

    it.each([
      { expected: '2026-05-12', last: '2026-05-12' },
      { expected: '2026-05-15', last: '2026-05-15' },
      { expected: '2026-05-15', last: '2026-06-30' },
    ] as const)('is $expected for a period whose last day is $last', ({ expected, last }) => {
      expect(lastResultDay(dayEnd(last, TIME_ZONE))).toBe(expected)
    })
  })
})
