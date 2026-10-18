import { createStore } from 'jotai'
import { describeInTimeZone } from '@/test-utils/timeZone'
import { dogCacheAtom } from './atoms'

// In Tokyo, where a local midnight is the Finnish day before: the cache keeps the day its picker showed.
describeInTimeZone('Asia/Tokyo', () => {
  describe('dogCacheAtom', () => {
    afterEach(() => localStorage.clear())

    // The dog's dates as this browser stored them before they were keys: its picker's local midnights,
    // read back as the days the picker showed (KOE-1548). The refresh stays a moment.
    it('reads a cached dog with its birthday, its refresh and its results (KOE-1546, KOE-1548)', () => {
      const localMidnight = (year: number, monthIndex: number, day: number) =>
        new Date(year, monthIndex, day).toISOString()
      localStorage.setItem(
        'dog-cache',
        JSON.stringify({
          'FI1/20': {
            dog: {
              dob: localMidnight(2020, 1, 3),
              name: '2024-05-01',
              refreshDate: '2026-05-01T08:00:00.000Z',
              regNo: 'FI1/20',
              results: [{ class: 'ALO', date: localMidnight(2025, 8, 13), result: 'ALO1' }],
            },
            results: [{ class: 'AVO', date: localMidnight(2025, 9, 13), id: 'm1', official: false, regNo: 'FI1/20' }],
          },
          'FI2/20': {},
        })
      )

      const cache = createStore().get(dogCacheAtom)

      expect(cache['FI1/20'].dog).toEqual({
        dob: '2020-02-03',
        name: '2024-05-01',
        refreshDate: new Date('2026-05-01T08:00:00.000Z'),
        regNo: 'FI1/20',
        results: [{ class: 'ALO', date: '2025-09-13', result: 'ALO1' }],
      })
      expect(cache['FI1/20'].results?.[0].date).toBe('2025-10-13')
      expect(cache['FI2/20']).toEqual({})
    })
  })
})
