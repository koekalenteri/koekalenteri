import type { PublicDogEvent, RegistrationClass } from '@/types'
import { createStore } from 'jotai'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from '@/__mockData__/events'
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
        {
          ...eventWithStaticDates,
          id: 'event-with-organizer',
          organizer: { id: 'org-1', name: 'Organizer One' },
          state: 'confirmed',
        },
        // An organizer without its data, to cover the filter's defensive path
        { ...eventWithStaticDates, id: 'event-without-organizer', organizer: { id: '', name: '' }, state: 'confirmed' },
      ])

      expect(store.get(filteredEventsAtom)).toHaveLength(2)
      expect(store.get(filterOrganizersAtom)).toEqual([{ id: 'org-1', name: 'Organizer One' }])
    })
  })

  describe('the option lists', () => {
    // One confirmed trial per row; only the fields the facets read differ.
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

  describe('filterEventClassesAtom', () => {
    const unofficial = (id: string, ownClasses?: PublicDogEvent['ownClasses']): PublicDogEvent => ({
      ...eventWithStaticDatesAndClass,
      classes: [{ class: 'ALO', date: eventWithStaticDatesAndClass.startDate }],
      eventType: 'Epävirallinen',
      id,
      ownClasses,
      state: 'confirmed',
    })
    const emptyFilter = { end: null, eventClass: [], eventType: [], judge: [], organizer: [], start: null }

    it('offers only the official classes: an own class coded ALO is none (KOE-1743)', () => {
      const store = createStore()
      store.set(eventFilterAtom, emptyFilter)
      store.set(eventsAtom, [unofficial('own', [{ code: 'ALO', name: { fi: 'Alokkaat' } }])])

      expect(store.get(filterEventClassesAtom)).toEqual([])
    })

    it('offers the official class an unofficial trial runs without own classes', () => {
      const store = createStore()
      store.set(eventFilterAtom, emptyFilter)
      store.set(eventsAtom, [unofficial('official-classes')])

      expect(store.get(filterEventClassesAtom)).toEqual(['ALO'])
    })
  })
})
