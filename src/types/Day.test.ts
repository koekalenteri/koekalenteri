import { isDayKey, toDayKey } from './Day'

describe('DayKey', () => {
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
  })

  it('sorts and compares as text, oldest first', () => {
    const days = [toDayKey(2026, 10, 25), toDayKey(2026, 3, 29), toDayKey(2025, 12, 31)]
    expect([...days].sort((a, b) => a.localeCompare(b))).toEqual(['2025-12-31', '2026-03-29', '2026-10-25'])
    expect(toDayKey(2026, 3, 29) < toDayKey(2026, 10, 25)).toBe(true)
  })
})
