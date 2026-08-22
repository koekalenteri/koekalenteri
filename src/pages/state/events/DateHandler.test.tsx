import type { PublicDogEvent } from '../../../types'
import { act, render } from '@testing-library/react'
import { addDays } from 'date-fns'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { getEvents } from '../../../api/event'
import { zonedStartOfDay } from '../../../i18n/dates'
import { eventFilterAtom, eventMetadataAtom, eventsAtom } from './atoms'
import { DateHandler } from './DateHandler'
import { RANGE_INCREMENTAL_THROTTLE } from './hooks'

vi.mock('../../../api/event', () => ({
  getEvent: vi.fn(),
  getEvents: vi.fn(),
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

const start = new Date('2026-01-02T00:00:00.000Z')
const end = new Date('2026-01-05T00:00:00.000Z')
const initialSystemTime = new Date('2026-01-02T12:00:00.000Z')

function renderDateHandler(lastSyncAt: number, filterStart: Date | null = start) {
  return render(
    <Provider
      initializeState={({ set }) => {
        set(eventsAtom, [makeEvent('event-1', '2026-01-03T00:00:00.000Z')])
        set(eventFilterAtom, {
          end,
          eventClass: [],
          eventType: [],
          judge: [],
          organizer: [],
          start: filterStart,
          withClosingEntry: false,
          withFreePlaces: false,
          withOpenEntry: false,
          withUpcomingEntry: false,
        })
        set(eventMetadataAtom, {
          lastRangeEnd: end.getTime(),
          lastRangeStart: start.getTime(),
          lastSyncAt,
          retainedStart: start.getTime(),
          singles: {},
        })
      }}
    >
      <DateHandler />
    </Provider>
  )
}

describe('DateHandler visibility refresh', () => {
  let visibilityStateSpy: import('vitest').MockInstance<() => DocumentVisibilityState>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(initialSystemTime)
    vi.clearAllMocks()
    localStorage.clear()
    visibilityStateSpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    ;(getEvents as import('vitest').Mock).mockResolvedValue({ events: [], unchangedIds: ['event-1'] })
  })

  afterEach(() => {
    visibilityStateSpy.mockRestore()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  async function renderDateHandlerAndResetCalls(lastSyncAt: number) {
    renderDateHandler(lastSyncAt)
    await act(async () => {
      await Promise.resolve()
    })
    ;(getEvents as import('vitest').Mock).mockClear()
  }

  it('does not refresh when the tab becomes visible and event metadata is still fresh', async () => {
    await renderDateHandlerAndResetCalls(Date.now())

    act(() => {
      vi.setSystemTime(new Date(initialSystemTime.getTime() + RANGE_INCREMENTAL_THROTTLE - 1000))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(getEvents).not.toHaveBeenCalled()
  })

  it('refreshes when the tab becomes visible and event metadata is stale', async () => {
    await renderDateHandlerAndResetCalls(Date.now())

    await act(async () => {
      vi.setSystemTime(new Date(initialSystemTime.getTime() + RANGE_INCREMENTAL_THROTTLE))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(getEvents).toHaveBeenCalledWith(start, end, initialSystemTime.getTime())
  })

  it('refreshes the default start when the zoned date changes', async () => {
    renderDateHandler(0, null)
    const initialStart = zonedStartOfDay(initialSystemTime)
    const nextStart = zonedStartOfDay(addDays(initialSystemTime, 1))
    const nextDayDelay = nextStart.getTime() - initialSystemTime.getTime() + 1000

    await act(async () => Promise.resolve())
    expect(getEvents).toHaveBeenCalledWith(initialStart, end, undefined)
    ;(getEvents as import('vitest').Mock).mockClear()

    await act(async () => {
      vi.advanceTimersByTime(nextDayDelay)
      await Promise.resolve()
    })

    expect(getEvents).toHaveBeenCalledWith(nextStart, end, expect.any(Number))
  })
})
