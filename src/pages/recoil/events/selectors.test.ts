import type { PublicDogEvent } from '../../../types'
import { snapshot_UNSTABLE } from 'recoil'
import { eventsAtom } from './atoms'
import { filteredEventsSelector, filterOrganizersSelector } from './selectors'

describe('event selectors', () => {
  describe('filterOrganizersSelector', () => {
    it('ignores events without organizer data', () => {
      const snapshot = snapshot_UNSTABLE(({ set }) => {
        set(eventsAtom, [
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
      })

      expect(snapshot.getLoadable(filteredEventsSelector).valueOrThrow()).toHaveLength(2)
      expect(snapshot.getLoadable(filterOrganizersSelector).valueOrThrow()).toEqual([
        { id: 'org-1', name: 'Organizer One' },
      ])
    })
  })
})
