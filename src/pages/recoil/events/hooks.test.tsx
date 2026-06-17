import type { PublicDogEvent } from '../../../types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { getEvents } from '../../../api/event'
import { EVENT_METADATA_INVALIDATED_STORAGE_KEY, eventMetadataAtom, eventsAtom, eventsLoadingAtom } from './atoms'
import { useFetchEvents } from './hooks'

jest.mock('../../../api/event', () => ({
  getEvent: jest.fn(),
  getEvents: jest.fn(),
}))

function makeEvent(id: string, startDate: string, endDate?: string): PublicDogEvent {
  return {
    classes: [],
    cost: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    description: '',
    endDate: endDate ? new Date(endDate) : new Date(startDate),
    eventType: 'TEST',
    id,
    judges: [],
    location: 'Test location',
    modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    name: id,
    organizer: { id: 'org-1', name: 'Organizer' },
    places: 0,
    startDate: new Date(startDate),
    state: 'confirmed',
  } as PublicDogEvent
}

function wrapperWithState(initialEvents: PublicDogEvent[], metadata: Record<string, unknown>) {
  return function Wrapper({ children }: { readonly children: React.ReactNode }) {
    return (
      <RecoilRoot
        initializeState={({ set }) => {
          set(eventsAtom, initialEvents)
          set(eventMetadataAtom, { singles: {}, ...metadata } as any)
        }}
      >
        {children}
      </RecoilRoot>
    )
  }
}

function wrapper({ children }: { readonly children: React.ReactNode }) {
  return <RecoilRoot>{children}</RecoilRoot>
}

describe('useFetchEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  it('prunes stale in-range events that are missing from incremental response membership', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    const kept = makeEvent('kept', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')
    const stale = makeEvent('stale', '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z')
    const outside = makeEvent('outside', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z')
    const changed = makeEvent('changed', '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z')

    ;(getEvents as jest.Mock).mockResolvedValue({
      events: [changed],
      unchangedIds: ['kept'],
    })

    const { result } = renderHook(
      () => ({
        events: useRecoilValue(eventsAtom),
        fetchEvents: useFetchEvents(),
      }),
      {
        wrapper: wrapperWithState([kept, stale, outside], {
          lastRangeEnd: end.getTime(),
          lastRangeStart: start.getTime(),
          lastSyncAt: Date.now() - 10 * 60 * 1000,
        }),
      }
    )

    await act(async () => {
      await result.current.fetchEvents(start, end)
    })

    await waitFor(() => {
      expect(result.current.events.map((event) => event.id)).toEqual(['kept', 'changed', 'outside'])
    })
  })

  it('replaces cached event with changed payload when event stays in range', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    const original = makeEvent('event-1', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')
    const changed = {
      ...makeEvent('event-1', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z'),
      name: 'Updated name',
    }

    ;(getEvents as jest.Mock).mockResolvedValue({
      events: [changed],
      unchangedIds: [],
    })

    const { result } = renderHook(
      () => ({
        events: useRecoilValue(eventsAtom),
        fetchEvents: useFetchEvents(),
      }),
      {
        wrapper: wrapperWithState([original], {
          lastRangeEnd: end.getTime(),
          lastRangeStart: start.getTime(),
          lastSyncAt: Date.now() - 10 * 60 * 1000,
        }),
      }
    )

    await act(async () => {
      await result.current.fetchEvents(start, end)
    })

    await waitFor(() => {
      expect(result.current.events).toEqual([changed])
    })
  })

  it('falls back to a full range fetch when delta unchanged ids are missing locally', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    const cached = makeEvent('cached', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')
    const outside = makeEvent('outside', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z')
    const changed = makeEvent('changed', '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z')
    const missingUnchanged = makeEvent('missing-unchanged', '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z')
    const lastSyncAt = Date.now() - 10 * 60 * 1000

    ;(getEvents as jest.Mock)
      .mockResolvedValueOnce({
        events: [changed],
        unchangedIds: ['cached', 'missing-unchanged'],
      })
      .mockResolvedValueOnce({
        events: [cached, changed, missingUnchanged],
        unchangedIds: [],
      })

    const { result } = renderHook(
      () => ({
        events: useRecoilValue(eventsAtom),
        fetchEvents: useFetchEvents(),
      }),
      {
        wrapper: wrapperWithState([cached, outside], {
          lastRangeEnd: end.getTime(),
          lastRangeStart: start.getTime(),
          lastSyncAt,
        }),
      }
    )

    await act(async () => {
      await result.current.fetchEvents(start, end)
    })

    await waitFor(() => {
      expect(getEvents).toHaveBeenNthCalledWith(1, start, end, lastSyncAt)
      expect(getEvents).toHaveBeenNthCalledWith(2, start, end)
      expect(result.current.events.map((event) => event.id)).toEqual([
        'cached',
        'changed',
        'missing-unchanged',
        'outside',
      ])
    })
  })

  it('sets eventsLoadingAtom to true before the API call and false after', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    const fetched = makeEvent('fetched', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')

    let resolveGetEvents!: (value: { events: (typeof fetched)[]; unchangedIds: string[] }) => void
    ;(getEvents as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGetEvents = resolve as typeof resolveGetEvents
        })
    )

    const loadingStates: boolean[] = []

    const { result } = renderHook(
      () => ({
        fetchEvents: useFetchEvents(),
        loading: useRecoilValue(eventsLoadingAtom),
      }),
      { wrapper: wrapperWithState([], {}) }
    )

    // Start the fetch but don't await it yet
    let fetchPromise: Promise<void>
    act(() => {
      fetchPromise = result.current.fetchEvents(start, end)
    })

    // After the synchronous set(eventsLoadingAtom, true) fires, loading should be true
    await waitFor(() => {
      loadingStates.push(result.current.loading)
      expect(result.current.loading).toBe(true)
    })

    // Resolve the API call
    act(() => {
      resolveGetEvents({ events: [fetched], unchangedIds: [] })
    })
    await act(async () => {
      await fetchPromise
    })

    // Loading should be false once the fetch is done
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('does not set eventsLoadingAtom when no start date is provided', async () => {
    const { result } = renderHook(
      () => ({
        fetchEvents: useFetchEvents(),
        loading: useRecoilValue(eventsLoadingAtom),
      }),
      { wrapper: wrapperWithState([], {}) }
    )

    await act(async () => {
      await result.current.fetchEvents(undefined, undefined, 'some-id')
    })

    expect(result.current.loading).toBe(false)
  })

  it('sets eventsLoadingAtom to false even when getEvents throws', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')

    ;(getEvents as jest.Mock).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(
      () => ({
        fetchEvents: useFetchEvents(),
        loading: useRecoilValue(eventsLoadingAtom),
      }),
      { wrapper: wrapperWithState([], {}) }
    )

    await act(async () => {
      await result.current.fetchEvents(start, end).catch(() => undefined)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('skips incremental fetch for throttled same-range requests and only refreshes metadata', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    const original = makeEvent('event-1', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')

    const { result } = renderHook(
      () => ({
        events: useRecoilValue(eventsAtom),
        fetchEvents: useFetchEvents(),
        metadata: useRecoilValue(eventMetadataAtom),
      }),
      {
        wrapper: wrapperWithState([original], {
          lastRangeEnd: end.getTime(),
          lastRangeStart: start.getTime(),
          lastSyncAt: Date.now() - 60 * 1000,
        }),
      }
    )

    await act(async () => {
      await result.current.fetchEvents(start, end)
    })

    await waitFor(() => {
      expect(getEvents).not.toHaveBeenCalled()
      expect(result.current.events).toEqual([original])
      expect(result.current.metadata.lastRangeStart).toBe(start.getTime())
      expect(result.current.metadata.lastRangeEnd).toBe(end.getTime())
      expect(result.current.metadata.retainedStart).toBe(start.getTime())
    })
  })

  it('uses cold-start full fetch when stored events invalidate already-loaded metadata', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    const cached = makeEvent('cached', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')
    const fetched = makeEvent('fetched', '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z')

    localStorage.setItem(
      'eventMetadata',
      JSON.stringify({
        lastRangeEnd: end.getTime(),
        lastRangeStart: start.getTime(),
        lastSyncAt: Date.now() - 60 * 1000,
        singles: {},
      })
    )
    localStorage.setItem('events', JSON.stringify([cached, { id: 'broken', name: 'Broken event' }]))

    ;(getEvents as jest.Mock).mockResolvedValue({
      events: [fetched],
      unchangedIds: [],
    })

    const { result } = renderHook(
      () => ({
        events: useRecoilValue(eventsAtom),
        fetchEvents: useFetchEvents(),
        // Read metadata before events to cover the startup ordering that regressed.
        metadata: useRecoilValue(eventMetadataAtom),
      }),
      { wrapper }
    )

    await act(async () => {
      await result.current.fetchEvents(start, end)
    })

    await waitFor(() => {
      expect(getEvents).toHaveBeenCalledWith(start, end, undefined)
      expect(result.current.events).toEqual([fetched])
      expect(result.current.metadata.lastSyncAt).toEqual(expect.any(Number))
      expect(localStorage.getItem(EVENT_METADATA_INVALIDATED_STORAGE_KEY)).toBeNull()
    })
  })

  it('keeps a websocket-updated stored event on reload when same-range fetch is throttled', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    const updatedByWebSocket = {
      ...makeEvent('event-1', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z'),
      entries: 12,
      members: 7,
      name: 'Updated by websocket',
    }

    localStorage.setItem('events', JSON.stringify([updatedByWebSocket]))
    localStorage.setItem(
      'eventMetadata',
      JSON.stringify({
        lastRangeEnd: end.getTime(),
        lastRangeStart: start.getTime(),
        lastSyncAt: Date.now() - 60 * 1000,
        singles: {},
      })
    )

    const { result } = renderHook(
      () => ({
        events: useRecoilValue(eventsAtom),
        fetchEvents: useFetchEvents(),
      }),
      { wrapper }
    )

    await act(async () => {
      await result.current.fetchEvents(start, end)
    })

    await waitFor(() => {
      expect(getEvents).not.toHaveBeenCalled()
      expect(result.current.events).toEqual([updatedByWebSocket])
    })
  })

  it('uses cold-start full fetch when sync watermark is missing', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    const fetched = makeEvent('fetched', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')

    ;(getEvents as jest.Mock).mockResolvedValue({
      events: [fetched],
      unchangedIds: [],
    })

    const { result } = renderHook(
      () => ({
        events: useRecoilValue(eventsAtom),
        fetchEvents: useFetchEvents(),
        metadata: useRecoilValue(eventMetadataAtom),
      }),
      {
        wrapper: wrapperWithState([], {
          lastRangeEnd: end.getTime(),
          lastRangeStart: start.getTime(),
        }),
      }
    )

    await act(async () => {
      await result.current.fetchEvents(start, end)
    })

    await waitFor(() => {
      expect(getEvents).toHaveBeenCalledWith(start, end, undefined)
      expect(result.current.events).toEqual([fetched])
      expect(result.current.metadata.lastSyncAt).toEqual(expect.any(Number))
    })
  })
})
