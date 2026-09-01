import type { PublicDogEvent } from '../../../types'
import { createStore } from 'jotai'
import { eventFilterAtom, eventsAtom } from './atoms'
import { filteredEventsAtom, filterOrganizersAtom } from './derivedAtoms'

describe('event derived atoms', () => {
  describe('filterOrganizersAtom', () => {
    it('ignores events without organizer data', () => {
      const store = createStore()
      store.set(eventFilterAtom, {
        end: null,
        eventClass: [],
        eventType: [],
        judge: [],
        organizer: [],
        start: null,
        withClosingEntry: false,
        withFreePlaces: false,
        withOpenEntry: false,
        withUpcomingEntry: false,
      })
      store.set(eventsAtom, [
        // The filters read only a few fields; the minimal events convert at these boundaries.
        {
          classes: [],
          endDate: new Date('2026-06-02'),
          eventType: 'NOME-B',
          id: 'event-with-organizer',
          judges: [],
          name: 'Event with organizer',
          organizer: { id: 'org-1', name: 'Organizer One' },
          places: 1,
          startDate: new Date('2026-06-01'),
          state: 'confirmed',
        } as unknown as PublicDogEvent,
        // Deliberately missing the organizer, to cover the filter's defensive path
        {
          classes: [],
          endDate: new Date('2026-06-04'),
          eventType: 'NOME-B',
          id: 'event-without-organizer',
          judges: [],
          name: 'Event without organizer',
          organizer: undefined,
          places: 1,
          startDate: new Date('2026-06-03'),
          state: 'confirmed',
        } as unknown as PublicDogEvent,
      ])

      expect(store.get(filteredEventsAtom)).toHaveLength(2)
      expect(store.get(filterOrganizersAtom)).toEqual([{ id: 'org-1', name: 'Organizer One' }])
    })
  })
})
