import type { DogEvent } from '../types'

import { eachDayOfInterval } from 'date-fns'
import { useRecoilValue } from 'recoil'

import { eventTypeGroupsSelector } from '../pages/recoil'

export const useEventRegistrationDates = (event: DogEvent, eventClass?: string) => {
  const eventTypeGroups = useRecoilValue(eventTypeGroupsSelector(event.eventType))

  if (event.classes.length) {
    return event.classes
      .filter((c) => (eventClass ? c.class === eventClass : true))
      .flatMap((c) => (c.groups ?? eventTypeGroups).map((time) => ({ date: c.date, time })))
  }

  return eachDayOfInterval({ start: event.startDate, end: event.endDate }).flatMap((date) =>
    eventTypeGroups.map((time) => ({ date, time }))
  )
}
