import type { PublicDogEvent } from '../../../types'
import { act, render, waitFor } from '@testing-library/react'
import { addDays } from 'date-fns'
import { RecoilRoot } from 'recoil'
import { getEvents } from '../../../api/event'
import { zonedStartOfDay } from '../../../i18n/dates'
import { eventFilterAtom, eventMetadataAtom, eventsAtom } from './atoms'
import { DateHandler } from './DateHandler'
import { RANGE_INCREMENTAL_THROTTLE } from './hooks'

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

const start = new Date('2026-01-02T00:00:00.000Z')
const end = new Date('2026-01-05T00:00:00.000Z')
const initialSystemTime = new Date('2026-01-02T12:00:00.000Z')

function renderDateHandler(lastSyncAt: number, filterStart: Date | null = start) {
  return render(
    <RecoilRoot
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
    </RecoilRoot>
  )
}

describe('DateHandler visibility refresh', () => {
  let visibilityStateSpy: jest.SpyInstance<DocumentVisibilityState>

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(initialSystemTime)
    jest.clearAllMocks()
    localStorage.clear()
    visibilityStateSpy = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    ;(getEvents as jest.Mock).mockResolvedValue({ events: [], unchangedIds: ['event-1'] })
  })

  afterEach(() => {
    visibilityStateSpy.mockRestore()
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  async function renderDateHandlerAndResetCalls(lastSyncAt: number) {
    renderDateHandler(lastSyncAt)
    await act(async () => {
      await Promise.resolve()
    })
    ;(getEvents as jest.Mock).mockClear()
  }

  it('does not refresh when the tab becomes visible and event metadata is still fresh', async () => {
    await renderDateHandlerAndResetCalls(Date.now())

    act(() => {
      jest.setSystemTime(new Date(initialSystemTime.getTime() + RANGE_INCREMENTAL_THROTTLE - 1000))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(getEvents).not.toHaveBeenCalled()
  })

  it('refreshes when the tab becomes visible and event metadata is stale', async () => {
    await renderDateHandlerAndResetCalls(Date.now())

    await act(async () => {
      jest.setSystemTime(new Date(initialSystemTime.getTime() + RANGE_INCREMENTAL_THROTTLE))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(getEvents).toHaveBeenCalledWith(start, end, initialSystemTime.getTime())
    })
  })

  it('refreshes the default start when the zoned date changes', async () => {
    renderDateHandler(0, null)
    const initialStart = zonedStartOfDay(initialSystemTime)
    const nextStart = zonedStartOfDay(addDays(initialSystemTime, 1))
    const nextDayDelay = nextStart.getTime() - initialSystemTime.getTime() + 1000

    await waitFor(() => {
      expect(getEvents).toHaveBeenCalledWith(initialStart, end, undefined)
    })
    ;(getEvents as jest.Mock).mockClear()

    await act(async () => {
      jest.advanceTimersByTime(nextDayDelay)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(getEvents).toHaveBeenCalledWith(nextStart, end, expect.any(Number))
    })
  })
})
