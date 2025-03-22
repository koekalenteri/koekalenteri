import { zonedEndOfDay, zonedStartOfDay } from '../../../i18n/dates'

import { readDate, withinDateFilters, writeDate } from './filters'

describe('recoil.events.filters', () => {
  describe('readDate', () => {
    it('should produce a date in finnish timezone', () => {
      expect(readDate('2024-01-01')?.valueOf()).toEqual(1704060000000)
      expect(readDate('2024-06-15')?.valueOf()).toEqual(1718398800000)
    })
  })

  describe('writeDate', () => {
    it('should produce a date string in finnish timezone', () => {
      expect(writeDate(new Date(1704060000000))).toEqual('2024-01-01')
      expect(writeDate(new Date(1704146399000))).toEqual('2024-01-01')
      expect(writeDate(new Date(1718398800000))).toEqual('2024-06-15')
    })
  })

  describe('withinDateFilters', () => {
    const today = new Date()
    const startOfToday = zonedStartOfDay(today)
    const endOfToday = zonedEndOfDay(today)
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
