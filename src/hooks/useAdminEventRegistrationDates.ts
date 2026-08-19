import type { PublicDogEvent } from '../types'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { getEventDays } from '../lib/event'
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
    return event.classes
      .filter((c) => (eventClass ? c.class === eventClass : true))
      .flatMap((c) => (c.groups ?? defaultGroups).map((time) => ({ date: c.date, time })))
  }

  if (event.dates) return event.dates

  return getEventDays(event).flatMap((date) => defaultGroups.map((time) => ({ date, time })))
}
