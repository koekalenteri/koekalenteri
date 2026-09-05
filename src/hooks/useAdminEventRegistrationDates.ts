import type { PublicDogEvent } from '../types'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { eventRegistrationDateKey, getEventDays } from '../lib/event'
import { adminEventTypeGroupsAtom } from '../pages/admin/state'

export const useAdminEventRegistrationDates = (
  event: Pick<PublicDogEvent, 'classes' | 'endDate' | 'startDate' | 'dates'> &
    Partial<Pick<PublicDogEvent, 'eventType'>>,
  eventClass?: string
) => {
  const eventTypeGroups = useAtomValue(adminEventTypeGroupsAtom(event.eventType))
  const defaultGroups = useMemo(
    () => (eventTypeGroups.length > 1 ? eventTypeGroups.filter((g) => g !== 'kp') : eventTypeGroups),
    [eventTypeGroups]
  )

  if (event.classes?.length) {
    const dates = event.classes
      .filter((c) => (eventClass ? c.class === eventClass : true))
      .flatMap((c) => (c.groups ?? defaultGroups).map((time) => ({ date: c.date, time })))
    // Classes that run the same day share the day group - its key carries no class - so without a
    // class filter the same day would otherwise come back once per class (KOE-912).
    const seen = new Set<string>()
    return dates.filter((date) => {
      const key = eventRegistrationDateKey(date)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  if (event.dates) return event.dates

  return getEventDays(event).flatMap((date) => defaultGroups.map((time) => ({ date, time })))
}
