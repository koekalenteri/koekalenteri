import { addDays } from 'date-fns'
import { useCallback, useEffect, useState } from 'react'
import { useRecoilValue } from 'recoil'
import { zonedStartOfDay } from '../../../i18n/dates'
import { eventFilterAtom, eventMetadataAtom } from './atoms'
import { RANGE_INCREMENTAL_THROTTLE, useFetchEvents } from './hooks'

const isEventMetadataStale = (lastSyncAt: number | undefined, now = Date.now()) =>
  !lastSyncAt || now - lastSyncAt >= RANGE_INCREMENTAL_THROTTLE

function useCurrentZonedStartOfDay() {
  const [today, setToday] = useState(() => zonedStartOfDay(new Date()))

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    const scheduleNextDay = () => {
      const now = new Date()
      const nextDay = zonedStartOfDay(addDays(now, 1))
      const delay = Math.max(1000, nextDay.getTime() - now.getTime() + 1000)

      timeout = setTimeout(() => {
        setToday(zonedStartOfDay(new Date()))
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
  const filter = useRecoilValue(eventFilterAtom)
  const metadata = useRecoilValue(eventMetadataAtom)
  const fetchEvents = useFetchEvents()
  const today = useCurrentZonedStartOfDay()
  const refreshCurrentRange = useCallback(() => {
    // Default start to "today" when missing.
    // This ensures pages that don't set a start date still get event data.
    const start = filter.start ?? today
    fetchEvents(start, filter.end || undefined)
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
