import type { PublicDogEvent } from '../types'

import { useRecoilValue } from 'recoil'

import { getEventDays } from '../lib/event'
import { eventTypeGroupsSelector } from '../pages/admin/recoil'

export const useEventDatesOptions = (
  event: Pick<PublicDogEvent, 'classes' | 'endDate' | 'startDate'> & Partial<Pick<PublicDogEvent, 'eventType'>>,
  eventClass?: string
) => {
  const eventTypeGroups = useRecoilValue(eventTypeGroupsSelector(event.eventType))

  if (event.classes?.length) {
    return event.classes
      .filter((c) => (eventClass ? c.class === eventClass : true))
      .flatMap((c) => (c.groups ?? eventTypeGroups).map((time) => ({ date: c.date, time })))
  }

  return getEventDays(event).flatMap((date) => eventTypeGroups.map((time) => ({ date, time })))
}
