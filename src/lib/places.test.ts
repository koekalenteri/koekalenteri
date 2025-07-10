import type { PartialEvent } from '../pages/admin/components/eventForm/types'
import type { DeepPartial, EventClass } from '../types'

import * as eventLib from './event'
import {
  calculateTotalFromClasses,
  calculateTotalFromDays,
  distributePlacesAmongClasses,
  distributePlacesAmongDays,
  updatePlacesPerDayFromClasses,
} from './places'

describe('places', () => {
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
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02'),
        judges: [],
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
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02'),
        judges: [],
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
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02'),
        judges: [],
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
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-02'),
        judges: [],
      }
      const newClasses: DeepPartial<EventClass>[] = [{ class: 'VOI', date: new Date('2023-01-02'), places: 15 }]
      const result = updatePlacesPerDayFromClasses(event, newClasses)
      expect(result).toEqual({
        '2023-01-02': 15,
      })
    })
  })

  describe('distributePlacesAmongDays', () => {
    it('should return empty object when there are no days', () => {
      const mockGetEventDays = jest.spyOn(eventLib, 'getEventDays').mockReturnValueOnce([])

      const result = distributePlacesAmongDays({
        startDate: new Date(),
        endDate: new Date(),
        classes: [],
        judges: [],
      })
      expect(result).toStrictEqual({})

      mockGetEventDays.mockRestore()
    })
    it('should distribute places evenly among days', () => {
      const event: PartialEvent = {
        places: 30,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-03'),
        classes: [],
        judges: [],
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
        places: 32,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-03'),
        classes: [],
        judges: [],
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
        places: 0,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-03'),
        classes: [],
        judges: [],
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
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-03'),
        classes: [],
        judges: [],
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
  })
})
