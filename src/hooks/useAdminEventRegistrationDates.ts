import type { PublicDogEvent } from '../types'

import { useMemo } from 'react'
import { useRecoilValue } from 'recoil'

import { getEventDays } from '../lib/event'
import { adminEventTypeGroupsSelector } from '../pages/admin/recoil'

export const useAdminEventRegistrationDates = (
  event: Pick<PublicDogEvent, 'classes' | 'endDate' | 'startDate' | 'dates'> &
    Partial<Pick<PublicDogEvent, 'eventType'>>,
  eventClass?: string
) => {
  const eventTypeGroups = useRecoilValue(adminEventTypeGroupsSelector(event.eventType))
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
