import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import { reportError } from '@/lib/client/error'
import { addDays, dayOf, dayStart, TIME_ZONE } from '@/lib/day'
import { eventFilterAtom, eventMetadataAtom } from './atoms'
import { RANGE_INCREMENTAL_THROTTLE, useFetchEvents } from './hooks'

const isEventMetadataStale = (lastSyncAt: number | undefined, now = Date.now()) =>
  !lastSyncAt || now - lastSyncAt >= RANGE_INCREMENTAL_THROTTLE

/** The Finnish midnight that began the day `now` falls on. */
const startOfToday = (now: Date) => dayStart(dayOf(now, TIME_ZONE), TIME_ZONE)

function useCurrentZonedStartOfDay() {
  const [today, setToday] = useState(() => startOfToday(new Date()))

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    const scheduleNextDay = () => {
      const now = new Date()
      const nextDay = dayStart(addDays(dayOf(now, TIME_ZONE), 1), TIME_ZONE)
      const delay = Math.max(1000, nextDay.getTime() - now.getTime() + 1000)

      timeout = setTimeout(() => {
        setToday(startOfToday(new Date()))
        scheduleNextDay()
      }, delay)
    }

    scheduleNextDay()

    return () => {
      clearTimeout(timeout)
    }
  }, [])

  return today
}

export function DateHandler() {
  const filter = useAtomValue(eventFilterAtom)
  const metadata = useAtomValue(eventMetadataAtom)
  const fetchEvents = useFetchEvents()
  const today = useCurrentZonedStartOfDay()
  const refreshCurrentRange = useCallback(() => {
    // Default start to "today" when missing.
    // This ensures pages that don't set a start date still get event data.
    const start = filter.start ?? today
    void fetchEvents(start, filter.end || undefined).catch(reportError)
  }, [filter.start, filter.end, fetchEvents, today])

  useEffect(() => {
    // Delegate all freshness/throttling decisions to useFetchEvents().
    // This keeps DateHandler small and makes fetch behavior unit-testable.
    refreshCurrentRange()
  }, [refreshCurrentRange])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible' || !isEventMetadataStale(metadata.lastSyncAt)) {
        return
      }

      refreshCurrentRange()
    }

    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [metadata.lastSyncAt, refreshCurrentRange])

  return null
}
