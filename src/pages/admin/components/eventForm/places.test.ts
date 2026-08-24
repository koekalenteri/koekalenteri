import type { DeepPartial, EventClass } from '../../../../types'
import type { PartialEvent } from './types'
import {
  calculateTotalFromClasses,
  calculateTotalFromDays,
  distributePlacesAmongClasses,
  distributePlacesAmongClassesPerDay,
  distributePlacesAmongDays,
  isClassDateActive,
  updatePlacesPerDayFromClasses,
} from './places'

describe('places', () => {
  describe('isClassDateActive', () => {
    it('treats undefined groups as active (feature not in use)', () => {
      expect(isClassDateActive({})).toBe(true)
    })

    it('treats a non-empty groups array as active', () => {
      expect(isClassDateActive({ groups: ['kp'] })).toBe(true)
    })

    it('treats an explicitly emptied groups array as inactive', () => {
      expect(isClassDateActive({ groups: [] })).toBe(false)
    })
  })

  describe('calculateTotalFromClasses', () => {
    it('should calculate total places from classes', () => {
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', places: 5 },
        { class: 'AVO', places: 10 },
        { class: 'VOI', places: 15 },
      ]
      expect(calculateTotalFromClasses(classes)).toBe(30)
    })

    it('should handle undefined places', () => {
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', places: 5 },
        { class: 'AVO' }, // undefined places
        { class: 'VOI', places: 15 },
      ]
      expect(calculateTotalFromClasses(classes)).toBe(20)
    })

    it('should return 0 for empty classes array', () => {
      expect(calculateTotalFromClasses([])).toBe(0)
    })

    it('should ignore class-day entries deselected via groups: []', () => {
      // Regression: a class can be deselected for a specific day via the class-groups
      // picker (groups: []) while still carrying a stray `places` value from before it
      // was deselected. That value must not count toward the total.
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', groups: ['kp'], places: 5 },
        { class: 'AVO', groups: ['kp'], places: 5 },
        { class: 'VOI', groups: [], places: 3 }, // deselected for this day
      ]
      expect(calculateTotalFromClasses(classes)).toBe(10)
    })
  })

  describe('calculateTotalFromDays', () => {
    it('should calculate total places from placesPerDay', () => {
      const placesPerDay = {
        '2023-01-01': 10,
        '2023-01-02': 15,
        '2023-01-03': 5,
      }
      expect(calculateTotalFromDays(placesPerDay)).toBe(30)
    })

    it('should handle undefined places', () => {
      const placesPerDay = {
        '2023-01-01': 10,
        '2023-01-02': undefined,
        '2023-01-03': 5,
      }
      expect(calculateTotalFromDays(placesPerDay)).toBe(15)
    })

    it('should return 0 for empty placesPerDay', () => {
      expect(calculateTotalFromDays({})).toBe(0)
    })

    it('should handle undefined placesPerDay', () => {
      expect(calculateTotalFromDays(undefined)).toBe(0)
    })
  })

  describe('updatePlacesPerDayFromClasses', () => {
    it('should update placesPerDay based on classes', () => {
      const event: PartialEvent = {
        classes: [
          { class: 'ALO', date: new Date('2023-01-01'), places: 5 },
          { class: 'AVO', date: new Date('2023-01-01'), places: 10 },
          { class: 'VOI', date: new Date('2023-01-02'), places: 15 },
        ],
        endDate: new Date('2023-01-02'),
        judges: [],
        startDate: new Date('2023-01-01'),
      }
      const result = updatePlacesPerDayFromClasses(event)
      expect(result).toEqual({
        '2023-01-01': 15, // 5 + 10
        '2023-01-02': 15,
      })
    })

    it('should handle classes without dates', () => {
      const event: PartialEvent = {
        classes: [
          // @ts-expect-error deliberately invalid data
          { class: 'ALO', places: 5 }, // no date
          { class: 'AVO', date: new Date('2023-01-01'), places: 10 },
          { class: 'VOI', date: new Date('2023-01-02'), places: 15 },
        ],
        endDate: new Date('2023-01-02'),
        judges: [],
        startDate: new Date('2023-01-01'),
      }
      const result = updatePlacesPerDayFromClasses(event)
      expect(result).toEqual({
        '2023-01-01': 10,
        '2023-01-02': 15,
      })
    })

    it('should handle classes with 0 places', () => {
      const event: PartialEvent = {
        classes: [
          { class: 'ALO', date: new Date('2023-01-01'), places: 0 },
          { class: 'AVO', date: new Date('2023-01-01'), places: 10 },
          { class: 'VOI', date: new Date('2023-01-02'), places: 0 },
        ],
        endDate: new Date('2023-01-02'),
        judges: [],
        startDate: new Date('2023-01-01'),
      }
      const result = updatePlacesPerDayFromClasses(event)
      expect(result).toEqual({
        '2023-01-01': 10,
        // '2023-01-02' is not included because total is 0
      })
    })

    it('should use provided classes if given', () => {
      const event: PartialEvent = {
        classes: [
          { class: 'ALO', date: new Date('2023-01-01'), places: 5 },
          { class: 'AVO', date: new Date('2023-01-01'), places: 10 },
        ],
        endDate: new Date('2023-01-02'),
        judges: [],
        startDate: new Date('2023-01-01'),
      }
      const newClasses: DeepPartial<EventClass>[] = [{ class: 'VOI', date: new Date('2023-01-02'), places: 15 }]
      const result = updatePlacesPerDayFromClasses(event, newClasses)
      expect(result).toEqual({
        '2023-01-02': 15,
      })
    })
  })

  describe('distributePlacesAmongDays', () => {
    it('should distribute places evenly among days', () => {
      const event: PartialEvent = {
        classes: [],
        endDate: new Date('2023-01-03T12:00:00Z'),
        judges: [],
        places: 30,
        startDate: new Date('2023-01-01T12:00:00Z'),
      }
      const result = distributePlacesAmongDays(event)
      expect(result).toEqual({
        '2023-01-01': 10,
        '2023-01-02': 10,
        '2023-01-03': 10,
      })
    })

    it('should handle uneven distribution with remainder going to first day', () => {
      const event: PartialEvent = {
        classes: [],
        endDate: new Date('2023-01-03'),
        judges: [],
        places: 32,
        startDate: new Date('2023-01-01'),
      }
      const result = distributePlacesAmongDays(event)
      expect(result).toEqual({
        '2023-01-01': 12, // 10 + 2 (remainder)
        '2023-01-02': 10,
        '2023-01-03': 10,
      })
    })

    it('should handle 0 places', () => {
      const event: PartialEvent = {
        classes: [],
        endDate: new Date('2023-01-03'),
        judges: [],
        places: 0,
        startDate: new Date('2023-01-01'),
      }
      const result = distributePlacesAmongDays(event)
      expect(result).toEqual({
        '2023-01-01': 0,
        '2023-01-02': 0,
        '2023-01-03': 0,
      })
    })

    it('should handle undefined places', () => {
      const event: PartialEvent = {
        classes: [],
        endDate: new Date('2023-01-03'),
        judges: [],
        startDate: new Date('2023-01-01'),
      }
      const result = distributePlacesAmongDays(event)
      expect(result).toEqual({
        '2023-01-01': 0,
        '2023-01-02': 0,
        '2023-01-03': 0,
      })
    })
  })

  describe('distributePlacesAmongClasses', () => {
    it('should return empty array when there are no classes', () => {
      const classes: DeepPartial<EventClass>[] = []
      const result = distributePlacesAmongClasses(classes, 1)
      expect(result).toStrictEqual([])
    })
    it('should distribute places evenly among classes', () => {
      const classes: DeepPartial<EventClass>[] = [{ class: 'ALO' }, { class: 'AVO' }, { class: 'VOI' }]
      const result = distributePlacesAmongClasses(classes, 30)
      expect(result).toEqual([
        { class: 'ALO', places: 10 },
        { class: 'AVO', places: 10 },
        { class: 'VOI', places: 10 },
      ])
    })

    it('should handle uneven distribution', () => {
      const classes: DeepPartial<EventClass>[] = [{ class: 'ALO' }, { class: 'AVO' }, { class: 'VOI' }]
      const result = distributePlacesAmongClasses(classes, 31)
      // The algorithm distributes places one by one, so the first classes get more
      expect(result).toEqual([
        { class: 'ALO', places: 11 },
        { class: 'AVO', places: 10 },
        { class: 'VOI', places: 10 },
      ])
    })

    it('should handle 0 places', () => {
      const classes: DeepPartial<EventClass>[] = [{ class: 'ALO' }, { class: 'AVO' }, { class: 'VOI' }]
      const result = distributePlacesAmongClasses(classes, 0)
      expect(result).toEqual([
        { class: 'ALO', places: 0 },
        { class: 'AVO', places: 0 },
        { class: 'VOI', places: 0 },
      ])
    })

    it('should preserve existing class properties', () => {
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', date: new Date('2023-01-01') },
        { class: 'AVO', judge: { id: 123, name: 'Judge 1' } },
        { class: 'VOI', entries: 5 },
      ]
      const result = distributePlacesAmongClasses(classes, 30)
      expect(result).toEqual([
        { class: 'ALO', date: new Date('2023-01-01'), places: 10 },
        { class: 'AVO', judge: { id: 123, name: 'Judge 1' }, places: 10 },
        { class: 'VOI', entries: 5, places: 10 },
      ])
    })

    it('should cap places at 200 per class', () => {
      const classes: DeepPartial<EventClass>[] = [{ class: 'ALO' }, { class: 'AVO' }]
      const result = distributePlacesAmongClasses(classes, 500)
      expect(result).toEqual([
        { class: 'ALO', places: 200 },
        { class: 'AVO', places: 200 },
      ])
    })

    it('should skip class-day entries deselected via groups: [], zeroing their places', () => {
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', groups: ['kp'] },
        { class: 'AVO', groups: [] }, // deselected
        { class: 'VOI', groups: ['kp'] },
      ]
      const result = distributePlacesAmongClasses(classes, 20)
      expect(result).toEqual([
        { class: 'ALO', groups: ['kp'], places: 10 },
        { class: 'AVO', groups: [], places: 0 },
        { class: 'VOI', groups: ['kp'], places: 10 },
      ])
    })
  })

  describe('distributePlacesAmongClassesPerDay', () => {
    it('should return empty array when there are no classes', () => {
      expect(distributePlacesAmongClassesPerDay([], { '2023-01-01': 10 })).toStrictEqual([])
    })

    it('should split each day’s total evenly among that day’s classes', () => {
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', date: new Date('2023-01-01') },
        { class: 'AVO', date: new Date('2023-01-01') },
        { class: 'VOI', date: new Date('2023-01-02') },
      ]
      const result = distributePlacesAmongClassesPerDay(classes, {
        '2023-01-01': 6,
        '2023-01-02': 4,
      })
      expect(result).toEqual([
        { class: 'ALO', date: new Date('2023-01-01'), places: 3 },
        { class: 'AVO', date: new Date('2023-01-01'), places: 3 },
        { class: 'VOI', date: new Date('2023-01-02'), places: 4 },
      ])
    })

    it('should preserve per-day totals instead of flattening to a single grand total', () => {
      // Regression: reusing distributePlacesAmongClasses (grand-total split) here would
      // discard the day-specific numbers the user just set.
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', date: new Date('2023-01-01') },
        { class: 'VOI', date: new Date('2023-01-02') },
      ]
      const result = distributePlacesAmongClassesPerDay(classes, {
        '2023-01-01': 2,
        '2023-01-02': 8,
      })
      expect(result).toEqual([
        { class: 'ALO', date: new Date('2023-01-01'), places: 2 },
        { class: 'VOI', date: new Date('2023-01-02'), places: 8 },
      ])
    })

    it('should treat a missing day total as 0', () => {
      const classes: DeepPartial<EventClass>[] = [{ class: 'ALO', date: new Date('2023-01-01') }]
      const result = distributePlacesAmongClassesPerDay(classes, {})
      expect(result).toEqual([{ class: 'ALO', date: new Date('2023-01-01'), places: 0 }])
    })

    it('should leave classes without a date unchanged', () => {
      const classes: DeepPartial<EventClass>[] = [{ class: 'ALO' }]
      const result = distributePlacesAmongClassesPerDay(classes, { '2023-01-01': 10 })
      expect(result).toEqual([{ class: 'ALO' }])
    })

    it('should cap places at 200 per class', () => {
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', date: new Date('2023-01-01') },
        { class: 'AVO', date: new Date('2023-01-01') },
      ]
      const result = distributePlacesAmongClassesPerDay(classes, { '2023-01-01': 500 })
      expect(result).toEqual([
        { class: 'ALO', date: new Date('2023-01-01'), places: 200 },
        { class: 'AVO', date: new Date('2023-01-01'), places: 200 },
      ])
    })

    it('should split a day’s total only among that day’s active classes, zeroing deselected ones', () => {
      const classes: DeepPartial<EventClass>[] = [
        { class: 'ALO', date: new Date('2023-01-01'), groups: ['kp'] },
        { class: 'VOI', date: new Date('2023-01-01'), groups: [] }, // deselected for this day
      ]
      const result = distributePlacesAmongClassesPerDay(classes, { '2023-01-01': 10 })
      expect(result).toEqual([
        { class: 'ALO', date: new Date('2023-01-01'), groups: ['kp'], places: 10 },
        { class: 'VOI', date: new Date('2023-01-01'), groups: [], places: 0 },
      ])
    })
  })
})
