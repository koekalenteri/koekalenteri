import type { PublicDogEvent } from '../types'
import { useAtomValue } from 'jotai'
import { getEventDays } from '../lib/event'
import { adminEventTypeGroupsAtom } from '../pages/admin/state'

export const useAdminEventDatesOptions = (
  event: Pick<PublicDogEvent, 'classes' | 'endDate' | 'startDate'> & Partial<Pick<PublicDogEvent, 'eventType'>>,
  eventClass?: string
) => {
  const eventTypeGroups = useAtomValue(adminEventTypeGroupsAtom(event.eventType))

  if (event.classes?.length) {
    return event.classes
      .filter((c) => (eventClass ? c.class === eventClass : true))
      .flatMap((c) => (c.groups ?? eventTypeGroups).map((time) => ({ date: c.date, time })))
  }

  return getEventDays(event).flatMap((date) => eventTypeGroups.map((time) => ({ date, time })))
}
