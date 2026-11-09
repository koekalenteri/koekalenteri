import type { PublicDogEvent } from '../types'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { adminRegistrationDates, defaultRegistrationGroups, formatTypeOf } from '../lib/event'
import { adminEventTypeGroupsAtom } from '../pages/admin/state'

export const useAdminEventRegistrationDates = (
  event: Pick<PublicDogEvent, 'classes' | 'endDate' | 'startDate' | 'dates'> &
    Partial<Pick<PublicDogEvent, 'eventType'>>,
  eventClass?: string
) => {
  const eventTypeGroups = useAtomValue(adminEventTypeGroupsAtom(formatTypeOf(event)))
  const defaultGroups = useMemo(() => defaultRegistrationGroups(eventTypeGroups), [eventTypeGroups])

  return adminRegistrationDates(event, defaultGroups, eventClass)
}
