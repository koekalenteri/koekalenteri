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
