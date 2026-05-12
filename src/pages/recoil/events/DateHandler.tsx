import { useEffect } from 'react'
import { useRecoilValue } from 'recoil'
import { zonedStartOfDay } from '../../../i18n/dates'
import { eventFilterAtom } from './atoms'
import { useFetchEvents } from './hooks'

export function DateHandler() {
  const filter = useRecoilValue(eventFilterAtom)
  const fetchEvents = useFetchEvents()

  useEffect(() => {
    // Default start to "today" when missing.
    // This ensures pages that don't set a start date still get event data.
    const start = filter.start ?? zonedStartOfDay(new Date())

    // Delegate all freshness/throttling decisions to useFetchEvents().
    // This keeps DateHandler small and makes fetch behavior unit-testable.
    fetchEvents(start, filter.end || undefined)
  }, [filter.start, filter.end, fetchEvents])

  return null
}
