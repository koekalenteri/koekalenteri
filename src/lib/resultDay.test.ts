import { describeInTimeZone } from '../test-utils/timeZone'
import { manualResultDay, officialResultDay } from './resultDay'

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

  it.each([
    { date: new Date('0001-01-01T00:00:00'), name: "the Kennel Club's empty date" },
    { date: new Date(Number.NaN), name: 'an invalid date' },
  ])('gives no day for $name', ({ date }) => {
    expect(officialResultDay(date)).toBeUndefined()
    expect(manualResultDay(date)).toBeUndefined()
  })
})
