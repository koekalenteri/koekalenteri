import type { PublicDogEvent } from '../../../types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { getEvents } from '../../../api/event'
import { eventMetadataAtom, eventsAtom } from './atoms'
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
})
