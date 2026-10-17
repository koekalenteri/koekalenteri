import type { PublicDogEvent } from '@/types'
import { eventWithStaticDates } from '@/__mockData__/events'
import { endOfFinnishDay, startOfFinnishDay } from '@/test-utils/finnishDays'
import {
  deserializeFilter,
  readDate,
  serializeFilter,
  withinDateFilters,
  withinResultsFilter,
  writeDate,
} from './filters'

describe('state.events.filters', () => {
  describe('readDate', () => {
    it('should produce a date in finnish timezone', () => {
      expect(readDate('2024-01-01')?.valueOf()).toEqual(1704060000000)
      expect(readDate('2024-06-15')?.valueOf()).toEqual(1718398800000)
    })

    it('reads anything that is not a day as no date', () => {
      expect(readDate('foo')).toBeNull()
      expect(readDate('2024-06-15T00:00:00Z')).toBeNull()
      expect(readDate(null)).toBeNull()
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
          end: null,
          eventClass: [],
          eventType: [],
          judge: [],
          organizer: [],
          start: null,
        })
      ).toEqual('s=')
    })

    it('serializes all fields', () => {
      expect(
        serializeFilter({
          end: endOfFinnishDay(new Date(1743449533000)),
          eventClass: ['ALO'],
          eventType: ['NOME-B'],
          judge: ['Tuomari Risto'],
          organizer: ['bOkL76mduc'],
          start: startOfFinnishDay(new Date(1742844733000)),
          withClosingEntry: true,
          withFreePlaces: true,
          withOpenEntry: true,
          withResults: true,
          withUpcomingEntry: true,
        })
      ).toEqual('s=2025-03-24&e=2025-03-31&c=ALO&t=NOME-B&j=Tuomari+Risto&o=bOkL76mduc&b=c&b=f&b=o&b=u&b=r')
    })
  })

  describe('deserializeFilter', () => {
    const today = new Date()
    const startOfToday = startOfFinnishDay(today)
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
        withResults: false,
        withUpcomingEntry: false,
      })
    })

    it('deseriealizes all filds', () => {
      expect(
        deserializeFilter('s=2025-03-24&e=2025-03-31&c=ALO&t=NOME-B&j=Tuomari+Risto&o=bOkL76mduc&b=c&b=f&b=o&b=u&b=r')
      ).toEqual({
        end: endOfFinnishDay(new Date(1743449533000)),
        eventClass: ['ALO'],
        eventType: ['NOME-B'],
        judge: ['Tuomari Risto'],
        organizer: ['bOkL76mduc'],
        start: startOfFinnishDay(new Date(1742844733000)),
        withClosingEntry: true,
        withFreePlaces: true,
        withOpenEntry: true,
        withResults: true,
        withUpcomingEntry: true,
      })
    })

    it('deserializes empty start', () => {
      expect(deserializeFilter('s=')).toEqual(expect.objectContaining({ start: null }))
    })
  })

  describe('withinDateFilters', () => {
    const today = new Date()
    const startOfToday = startOfFinnishDay(today)
    const endOfToday = endOfFinnishDay(today)
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
        expect(withinDateFilters({ endDate }, { end: null, start })).toEqual(true)
      })
    })

    describe('when endDate is undefined', () => {
      it.each`
        start
        ${today}
        ${startOfToday}
        ${endOfToday}
      `('and start is $start, it should return false', ({ start }) => {
        expect(withinDateFilters({ endDate: undefined }, { end: null, start })).toEqual(false)
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
        expect(withinDateFilters({ startDate }, { end, start: null })).toEqual(true)
      })
    })
    describe('when startDate is undefined', () => {
      it.each`
        end
        ${today}
        ${startOfToday}
        ${endOfToday}
      `('and end is $end, it should return false', ({ end }) => {
        expect(withinDateFilters({ startDate: undefined }, { end, start: null })).toEqual(false)
      })
    })
  })

  describe('withinResultsFilter', () => {
    const filter = deserializeFilter('b=r')
    // A classless trial held in 2021 with its start list public: only the results flag varies.
    const event = (
      resultsPublished?: PublicDogEvent['resultsPublished'],
      startListPublished: PublicDogEvent['startListPublished'] = true
    ): PublicDogEvent => ({ ...eventWithStaticDates, resultsPublished, startListPublished, state: 'picked' })
    // The same trial with two classes of no state of their own, so the dates and the flags decide.
    const classed = (
      resultsPublished: PublicDogEvent['resultsPublished'],
      startListPublished: PublicDogEvent['startListPublished'] = true
    ): PublicDogEvent => ({
      ...event(resultsPublished, startListPublished),
      classes: [
        { class: 'ALO', date: eventWithStaticDates.startDate },
        { class: 'AVO', date: eventWithStaticDates.startDate },
      ],
    })

    it('passes everything while the switch is off', () => {
      expect(withinResultsFilter(event(), deserializeFilter(''))).toBe(true)
    })

    it('keeps only events with something published', () => {
      expect(withinResultsFilter(event(), filter)).toBe(false)
      expect(withinResultsFilter(event(false), filter)).toBe(false)
      expect(withinResultsFilter(event(true), filter)).toBe(true)
      // One published class is enough: the reader came for results, not for completeness.
      expect(withinResultsFilter(classed({ ALO: true, AVO: false }), filter)).toBe(true)
      expect(withinResultsFilter(classed({ ALO: false }), filter)).toBe(false)
    })

    it('leaves out an event whose start list is hidden, since its row has no link to the results (KOE-1504)', () => {
      // The secretary hid the start list after publishing the results: the row says only that the
      // trial is over, so listing it under "results published" would promise what the row cannot show.
      expect(withinResultsFilter(event(true, false), filter)).toBe(false)
    })

    it('leaves out an event whose only published results are in a class with a hidden start list', () => {
      // AVO's results went out and then its list was hidden; ALO's list is public but has no results.
      // Some list and some results are public, but no class has both, so there is nothing to read.
      expect(withinResultsFilter(classed({ AVO: true }, { ALO: true, AVO: false }), filter)).toBe(false)
    })
  })
})
