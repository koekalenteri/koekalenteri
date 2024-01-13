import type { PublicDogEvent } from '../types'

import { useMemo } from 'react'
import { eachDayOfInterval } from 'date-fns'
import { useRecoilValue } from 'recoil'

import { eventTypeGroupsSelector } from '../pages/admin/recoil'

export const useEventRegistrationDates = (
  event: Pick<PublicDogEvent, 'classes' | 'eventType' | 'startDate' | 'endDate'>,
  eventClass?: string
) => {
  const eventTypeGroups = useRecoilValue(eventTypeGroupsSelector(event.eventType))
  const defaultGroups = useMemo(() => eventTypeGroups.filter((g) => g !== 'kp'), [eventTypeGroups])

  if (event.classes.length) {
    return event.classes
      .filter((c) => (eventClass ? c.class === eventClass : true))
      .flatMap((c) => (c.groups ?? defaultGroups).map((time) => ({ date: c.date, time })))
  }

  return eachDayOfInterval({ start: event.startDate, end: event.endDate }).flatMap((date) =>
    eventTypeGroups.map((time) => ({ date, time }))
  )
}
