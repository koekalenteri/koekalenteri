import type { JsonPublicDogEvent } from '@/types'
import { createStore } from 'jotai'
import { EVENT_METADATA_INVALIDATED_STORAGE_KEY, eventsAtom } from './atoms'

/** A stored calendar event as the browser wrote it: the dates as ISO strings. */
const storedEvent = {
  classes: [{ class: 'ALO', date: '2026-09-11T21:00:00.000Z' }],
  cost: 50,
  createdAt: '2026-01-02T10:00:00.000Z',
  description: '2026-09-12',
  endDate: '2026-09-11T21:00:00.000Z',
  eventType: 'NOME-B',
  id: 'e1',
  judges: [],
  location: 'Tampere',
  modifiedAt: '2026-01-03T10:00:00.000Z',
  name: 'Syyskoe',
  organizer: { id: 'org-1', name: 'Kerho' },
  places: 10,
  startDate: '2026-09-11T21:00:00.000Z',
  state: 'confirmed',
} satisfies Partial<JsonPublicDogEvent>

describe('eventsAtom', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('reads the stored calendar through its converter before refining it, and writes nothing back (KOE-1546)', () => {
    localStorage.setItem('events', JSON.stringify([storedEvent]))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    const events = createStore().get(eventsAtom)

    // Without the converter running first, `isStoredPublicDogEvent` would drop the event for its
    // string dates and invalidate the metadata on every load.
    expect(events).toHaveLength(1)
    expect(events[0].startDate).toEqual(new Date('2026-09-11T21:00:00.000Z'))
    expect(events[0].classes[0].date).toEqual(new Date('2026-09-11T21:00:00.000Z'))
    expect(events[0].description).toBe('2026-09-12')
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem(EVENT_METADATA_INVALIDATED_STORAGE_KEY)).toBeNull()
  })

  it('drops a stored event that is not a calendar event, and invalidates the metadata', () => {
    localStorage.setItem('events', JSON.stringify([storedEvent, { id: 'draft', state: 'draft' }]))

    const events = createStore().get(eventsAtom)

    expect(events.map((event) => event.id)).toEqual(['e1'])
    expect(localStorage.getItem(EVENT_METADATA_INVALIDATED_STORAGE_KEY)).toBe('true')
  })
})
