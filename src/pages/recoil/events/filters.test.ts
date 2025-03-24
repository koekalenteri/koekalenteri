import { zonedEndOfDay, zonedStartOfDay } from '../../../i18n/dates'

import { deserializeFilter, readDate, serializeFilter, withinDateFilters, writeDate } from './filters'

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

  describe('serializeFilter', () => {
    it('serializes empty filter', () => {
      expect(
        serializeFilter({
          start: null,
          end: null,
          eventType: [],
          eventClass: [],
          judge: [],
          organizer: [],
        })
      ).toEqual('s=')
    })

    it('serializes all fields', () => {
      expect(
        serializeFilter({
          end: zonedEndOfDay(new Date(1743449533000)),
          eventClass: ['ALO'],
          eventType: ['NOME-B'],
          judge: ['Tuomari Risto'],
          organizer: ['bOkL76mduc'],
          start: zonedStartOfDay(new Date(1742844733000)),
          withClosingEntry: true,
          withFreePlaces: true,
          withOpenEntry: true,
          withUpcomingEntry: true,
        })
      ).toEqual('s=2025-03-24&e=2025-03-31&c=ALO&t=NOME-B&j=Tuomari+Risto&o=bOkL76mduc&b=c&b=f&b=o&b=u')
    })
  })

  describe('deserializeFilter', () => {
    const today = new Date()
    const startOfToday = zonedStartOfDay(today)
    it('ignores unknown params', () => {
      expect(deserializeFilter('fblcid=asdf')).toEqual({
        end: null,
        eventClass: [],
        eventType: [],
        judge: [],
        organizer: [],
        start: startOfToday,
        withClosingEntry: false,
        withFreePlaces: false,
        withOpenEntry: false,
        withUpcomingEntry: false,
      })
    })

    it('deseriealizes all filds', () => {
      expect(
        deserializeFilter('s=2025-03-24&e=2025-03-31&c=ALO&t=NOME-B&j=Tuomari+Risto&o=bOkL76mduc&b=c&b=f&b=o&b=u')
      ).toEqual({
        end: zonedEndOfDay(new Date(1743449533000)),
        eventClass: ['ALO'],
        eventType: ['NOME-B'],
        judge: ['Tuomari Risto'],
        organizer: ['bOkL76mduc'],
        start: zonedStartOfDay(new Date(1742844733000)),
        withClosingEntry: true,
        withFreePlaces: true,
        withOpenEntry: true,
        withUpcomingEntry: true,
      })
    })

    it('deserializes empty start', () => {
      expect(deserializeFilter('s=')).toEqual(expect.objectContaining({ start: null }))
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
