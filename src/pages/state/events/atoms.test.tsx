import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { Provider, useAtomValue } from 'jotai'
import { EVENT_METADATA_INVALIDATED_STORAGE_KEY, eventMetadataAtom, eventsAtom } from './atoms'

const validEvent = {
  classes: [],
  cost: 0,
  description: '',
  endDate: '2026-01-02T00:00:00.000Z',
  entries: 0,
  eventType: 'NOME-B',
  id: 'event-1',
  judges: [],
  location: 'Helsinki',
  name: 'Valid event',
  organizer: { id: 'org-1', name: 'Organizer' },
  places: 0,
  startDate: '2026-01-01T00:00:00.000Z',
  state: 'confirmed',
}

const wrapper = ({ children }: { readonly children: ReactNode }) => <Provider>{children}</Provider>

describe('eventsAtom storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => vi.restoreAllMocks())

  it('reads the stored calendar through its converter before refining it, and writes nothing back (KOE-1546)', () => {
    localStorage.setItem(
      'events',
      JSON.stringify([
        { ...validEvent, classes: [{ class: 'ALO', date: validEvent.startDate }], description: '2026-01-01' },
      ])
    )
    // The test's localStorage is a plain object of mocks, not a Storage: spy on the instance, after the seed.
    const setItem = vi.spyOn(localStorage, 'setItem')
    setItem.mockClear()

    const { result } = renderHook(() => useAtomValue(eventsAtom), { wrapper })

    // Refined before converting, `isStoredPublicDogEvent` would drop the event for its string dates
    // and invalidate the metadata on every load.
    expect(result.current).toHaveLength(1)
    // A calendar cached by the bundle before KOE-1547 holds instants: each is read as its Finnish day.
    expect(result.current[0]?.startDate).toBe('2026-01-01')
    expect(result.current[0]?.classes[0]?.date).toBe('2026-01-01')
    expect(result.current[0]?.description).toBe('2026-01-01')
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem(EVENT_METADATA_INVALIDATED_STORAGE_KEY)).toBeNull()
  })

  it('drops malformed stored public events and invalidates event metadata', () => {
    localStorage.setItem(
      'events',
      JSON.stringify([
        validEvent,
        { id: 'event-2', name: 'Broken event' },
        { ...validEvent, id: 'event-3', organizer: undefined },
        // A day missing, or one with no day to read, which the converter passes on as it came (KOE-1547).
        { ...validEvent, id: 'event-4', startDate: undefined },
        { ...validEvent, id: 'event-5', startDate: 'garbage' },
        { ...validEvent, endDate: undefined, id: 'event-6' },
        { ...validEvent, endDate: 'garbage', id: 'event-7' },
      ])
    )
    localStorage.setItem('eventMetadata', JSON.stringify({ lastSyncAt: Date.now(), singles: {} }))

    const { result } = renderHook(() => useAtomValue(eventsAtom), { wrapper })

    expect(result.current).toHaveLength(1)
    expect(result.current[0]?.id).toBe('event-1')
    expect(result.current[0]?.startDate).toBe('2026-01-01')
    expect(localStorage.getItem('eventMetadata')).toBeNull()
    expect(JSON.parse(localStorage.getItem('events') ?? '[]')).toHaveLength(1)
  })

  it('keeps stored tentative-compatible public events without optional fields', () => {
    const metadata = { lastSyncAt: Date.now(), singles: {} }
    localStorage.setItem(
      'events',
      JSON.stringify([
        {
          ...validEvent,
          classes: undefined,
          judges: undefined,
          location: undefined,
          name: undefined,
          organizer: { id: 'org-1' },
          state: 'tentative',
        },
      ])
    )
    localStorage.setItem('eventMetadata', JSON.stringify(metadata))

    const { result } = renderHook(() => useAtomValue(eventsAtom), { wrapper })

    expect(result.current).toHaveLength(1)
    expect(result.current[0]?.id).toBe('event-1')
    expect(result.current[0]?.classes).toBeUndefined()
    expect(result.current[0]?.judges).toBeUndefined()
    expect(result.current[0]?.location).toBeUndefined()
    expect(result.current[0]?.name).toBeUndefined()
    expect(result.current[0]?.organizer.name).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('eventMetadata') ?? '{}')).toEqual(metadata)
    expect(JSON.parse(localStorage.getItem('events') ?? '[]')).toHaveLength(1)
  })

  it('resets malformed stored event payloads', () => {
    localStorage.setItem('events', JSON.stringify({ id: 'event-1' }))

    const { result } = renderHook(
      () => ({
        events: useAtomValue(eventsAtom),
        metadata: useAtomValue(eventMetadataAtom),
      }),
      { wrapper }
    )

    expect(result.current.events).toEqual([])
    expect(result.current.metadata).toEqual({ singles: {} })
    expect(localStorage.getItem('events')).toBeNull()
  })
})
