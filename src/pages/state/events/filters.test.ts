import type { PublicDogEvent } from '@/types'
import { eventWithStaticDates } from '@/__mockData__/events'
import { addDays } from '@/lib/day'
import { endOfFinnishDay, startOfFinnishDay } from '@/test-utils/finnishDays'
import { deserializeFilter, serializeFilter, withinDateFilters, withinResultsFilter } from './filters'

describe('state.events.filters', () => {
  describe('the URL days', () => {
    it('reads anything that is not a day as no day', () => {
      expect(deserializeFilter('s=foo&e=2024-06-15T00:00:00Z')).toEqual(
        expect.objectContaining({ end: null, start: null })
      )
      // A day past the accepted years: its end would be a year no key can spell.
      expect(deserializeFilter('s=2026-10-17&e=9999-12-31').end).toBeNull()
    })

    it('are the day keys of the filter, both ways (KOE-1548)', () => {
      const filter = deserializeFilter('s=2026-04-06&e=2026-04-12')

      expect(filter).toEqual(expect.objectContaining({ end: '2026-04-12', start: '2026-04-06' }))
      expect(serializeFilter(filter)).toEqual('s=2026-04-06&e=2026-04-12')
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
          end: '2025-03-31',
          eventClass: ['ALO'],
          eventType: ['NOME-B'],
          judge: ['Tuomari Risto'],
          organizer: ['bOkL76mduc'],
          start: '2025-03-24',
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
    afterEach(() => vi.useRealTimers())

    it('ignores unknown params', () => {
      // Without `s` the list starts today in Finland: 23:30 on 17.10. there, already the 18th in Tokyo.
      vi.useFakeTimers({ now: new Date('2026-10-17T20:30:00.000Z'), toFake: ['Date'] })
      expect(deserializeFilter('fblcid=asdf')).toEqual({
        end: null,
        eventClass: [],
        eventType: [],
        judge: [],
        organizer: [],
        start: '2026-10-17',
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
        end: '2025-03-31',
        eventClass: ['ALO'],
        eventType: ['NOME-B'],
        judge: ['Tuomari Risto'],
        organizer: ['bOkL76mduc'],
        start: '2025-03-24',
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
    const day = '2026-10-17'

    it('leaves out an event whose stored date has no calendar day, instead of failing the list', () => {
      const yearOne = new Date('0001-01-01T00:00:00')
      const stored = startOfFinnishDay(day)
      expect(withinDateFilters({ endDate: yearOne, startDate: yearOne }, { end: null, start: day })).toBe(false)
      expect(withinDateFilters({ endDate: stored, startDate: new Date(Number.NaN) }, { end: day, start: null })).toBe(
        false
      )
    })

    // A stored date is any moment of its Finnish day; the filter's days include both ends.
    const moments = [
      { moment: startOfFinnishDay(day), name: 'start of day' },
      { moment: new Date(startOfFinnishDay(day).getTime() + 12 * 3_600_000), name: 'noon' },
      { moment: endOfFinnishDay(day), name: 'end of day' },
    ]

    it.each(moments)('keeps an event that ends at $name on the first day of the filter', ({ moment: endDate }) => {
      expect(withinDateFilters({ endDate }, { end: null, start: day })).toBe(true)
      expect(withinDateFilters({ endDate }, { end: null, start: null })).toBe(true)
      expect(withinDateFilters({ endDate }, { end: null, start: addDays(day, 1) })).toBe(false)
    })

    it.each(moments)('keeps an event that starts at $name on the last day of the filter', ({ moment: startDate }) => {
      expect(withinDateFilters({ startDate }, { end: day, start: null })).toBe(true)
      expect(withinDateFilters({ startDate }, { end: null, start: null })).toBe(true)
      expect(withinDateFilters({ startDate }, { end: addDays(day, -1), start: null })).toBe(false)
    })

    it('leaves out an event without the date a bound is compared with', () => {
      expect(withinDateFilters({ endDate: undefined }, { end: null, start: day })).toBe(false)
      expect(withinDateFilters({ startDate: undefined }, { end: day, start: null })).toBe(false)
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
