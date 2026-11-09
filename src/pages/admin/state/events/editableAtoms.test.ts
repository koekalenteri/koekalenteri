import type { DogEvent } from '@/types'
import { createStore } from 'jotai'
import { emptyEvent } from '@/__mockData__/emptyEvent'
import { adminEventIdAtom, adminEventsAtom } from './atoms'
import { adminEventClassAtom } from './editableAtoms'

describe('adminEventClassAtom', () => {
  beforeEach(() => sessionStorage.clear())

  // KOE-674: the class a page opens on is the first one in the event's order, as the secretary listed them.
  it("opens on the first of the event's own classes, not the first in the alphabet", () => {
    const event: DogEvent = {
      ...emptyEvent,
      classes: [
        { class: 'DERBY', date: '2026-08-01' },
        { class: 'VET10', date: '2026-08-01' },
      ],
      eventType: 'WT-harjoitus',
      id: 'own-classes',
      ownClasses: [
        { code: 'VET10', name: { fi: 'Veteraanit' } },
        { code: 'DERBY', name: { fi: 'Derby' } },
      ],
    }
    const store = createStore()
    store.set(adminEventsAtom, [event])
    store.set(adminEventIdAtom, event.id)

    expect(store.get(adminEventClassAtom)).toBe('VET10')
  })
})
