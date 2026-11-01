import type { PublicDogEvent, RegistrationClass } from '@/types'
import { createStore } from 'jotai'
import { eventWithStaticDatesAndClass } from '@/__mockData__/events'
import { eventFilterAtom, eventsAtom } from './atoms'
import {
  filterEventClassesAtom,
  filterEventTypesAtom,
  filteredEventsAtom,
  filterJudgesAtom,
  filterOrganizersAtom,
} from './derivedAtoms'

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

  describe('the option lists', () => {
    // The filters read only a few fields; the minimal events convert at this boundary.
    const trial = (
      id: string,
      eventType: string,
      eventClass: RegistrationClass,
      judge: string,
      organizer: string
    ): PublicDogEvent => ({
      ...eventWithStaticDatesAndClass,
      classes: [{ class: eventClass, date: eventWithStaticDatesAndClass.startDate }],
      eventType,
      id,
      judges: [{ id: 1, name: judge }],
      name: id,
      organizer: { id: organizer, name: organizer },
      state: 'confirmed',
    })
    const store = createStore()
    store.set(eventsAtom, [
      trial('a', 'NOME-B', 'ALO', 'Judge A', 'org-1'),
      trial('b', 'NOU', 'AVO', 'Judge B', 'org-1'),
      trial('c', 'NOME-A', 'VOI', 'Judge C', 'org-2'),
    ])
    // NOME-B selected, and the search held to org-1.
    store.set(eventFilterAtom, {
      end: null,
      eventClass: [],
      eventType: ['NOME-B'],
      judge: [],
      organizer: ['org-1'],
      start: null,
    })

    it('apply every facet to the list', () => {
      expect(store.get(filteredEventsAtom).map((event) => event.id)).toEqual(['a'])
    })

    it('list each facet from the events every other facet allows', () => {
      // NOU is selected out by the type facet itself, so it stays on offer; NOME-A is out by organizer.
      expect(store.get(filterEventTypesAtom)).toEqual(['NOME-B', 'NOU'])
      expect(store.get(filterEventClassesAtom)).toEqual(['ALO'])
      expect(store.get(filterJudgesAtom).map((judge) => judge.name)).toEqual(['Judge A'])
      // org-2 holds only a NOME-A trial, which the type facet leaves out.
      expect(store.get(filterOrganizersAtom).map((organizer) => organizer.id)).toEqual(['org-1'])
    })
  })
})
