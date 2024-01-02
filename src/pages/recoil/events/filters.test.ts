import { endOfDay, startOfDay } from 'date-fns'

import { readDate, withinDateFilters, writeDate } from './filters'

describe('recoil.events.filters', () => {
  describe('readDate', () => {
    it('should produce a date in local timezone', () => {
      expect(readDate('2024-01-01')?.getDate()).toEqual(1)
      expect(readDate('2024-01-01')?.getUTCDate()).toEqual(1)
      expect(readDate('2024-01-01')?.getHours()).toBeCloseTo(new Date().getTimezoneOffset() / -60, 10)
    })
  })

  describe('writeDate', () => {
    it('should produce a date string from date', () => {
      expect(writeDate(new Date(2024, 0, 1, 0, 0, 0))).toEqual('2024-01-01')
      expect(writeDate(new Date(2024, 0, 1, 23, 59, 59))).toEqual('2024-01-01')
    })
  })

  describe('withinDateFilters', () => {
    const today = new Date()
    const startOfToday = startOfDay(today)
    const endOfToday = endOfDay(today)
    describe.each`
      endDate
      ${today}
      ${startOfToday}
      ${endOfToday}
    `('when endDate is $endDate', ({ endDate }) => {
      it.each`
        start
        ${null}
        ${today}
        ${startOfToday}
        ${endOfToday}
      `('and start is $start, it should return true', ({ start }) => {
        expect(withinDateFilters({ endDate }, { start, end: null })).toEqual(true)
      })
    })

    describe('when endDate is undefined', () => {
      it.each`
        start
        ${today}
        ${startOfToday}
        ${endOfToday}
      `('and start is $start, it should return false', ({ start }) => {
        expect(withinDateFilters({ endDate: undefined }, { start, end: null })).toEqual(false)
      })
    })

    describe.each`
      startDate
      ${today}
      ${startOfToday}
      ${endOfToday}
    `('when startDate is $startDate', ({ startDate }) => {
      it.each`
        end
        ${null}
        ${today}
        ${startOfToday}
        ${endOfToday}
      `('and end is $end, it should return true', ({ end }) => {
        expect(withinDateFilters({ startDate }, { start: null, end })).toEqual(true)
      })
    })
    describe('when startDate is undefined', () => {
      it.each`
        end
        ${today}
        ${startOfToday}
        ${endOfToday}
      `('and end is $end, it should return false', ({ end }) => {
        expect(withinDateFilters({ startDate: undefined }, { start: null, end })).toEqual(false)
      })
    })
  })
})
