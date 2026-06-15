import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { eventMetadataAtom, eventsAtom } from './atoms'

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

const wrapper = ({ children }: { readonly children: ReactNode }) => <RecoilRoot>{children}</RecoilRoot>

describe('eventsAtom storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('drops malformed stored public events and invalidates event metadata', () => {
    localStorage.setItem(
      'events',
      JSON.stringify([
        validEvent,
        { id: 'event-2', name: 'Broken event' },
        { ...validEvent, id: 'event-3', organizer: undefined },
      ])
    )
    localStorage.setItem('eventMetadata', JSON.stringify({ lastSyncAt: Date.now(), singles: {} }))

    const { result } = renderHook(() => useRecoilValue(eventsAtom), { wrapper })

    expect(result.current).toHaveLength(1)
    expect(result.current[0]?.id).toBe('event-1')
    expect(result.current[0]?.startDate).toBeInstanceOf(Date)
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

    const { result } = renderHook(() => useRecoilValue(eventsAtom), { wrapper })

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
        events: useRecoilValue(eventsAtom),
        metadata: useRecoilValue(eventMetadataAtom),
      }),
      { wrapper }
    )

    expect(result.current.events).toEqual([])
    expect(result.current.metadata).toEqual({ singles: {} })
    expect(localStorage.getItem('events')).toBeNull()
  })
})
