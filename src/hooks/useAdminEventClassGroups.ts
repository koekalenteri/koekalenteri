import type { ClassOrderOwner } from '../lib/event'
import type { ClassGroup } from '../lib/teamSelection'
import type { PublicDogEvent } from '../types'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import {
  adminRegistrationDates,
  defaultRegistrationGroups,
  eventRegistrationDateKey,
  formatTypeOf,
  uniqueClasses,
} from '../lib/event'
import { adminEventTypeGroupsAtom } from '../pages/admin/state'

/**
 * Each class's groups, as the class view lists them (`adminRegistrationDates`): the days and halves a
 * whole team's dogs can be moved to, class by class (KOE-1722).
 */
export const useAdminEventClassGroups = (
  event:
    | (Pick<PublicDogEvent, 'classes' | 'endDate' | 'startDate' | 'dates' | 'eventType' | 'officialFormat'> &
        ClassOrderOwner)
    | undefined
): ReadonlyMap<string, readonly ClassGroup[]> => {
  const eventTypeGroups = useAtomValue(adminEventTypeGroupsAtom(formatTypeOf(event ?? { eventType: '' })))
  return useMemo(() => {
    if (!event) return new Map()
    const defaultGroups = defaultRegistrationGroups(eventTypeGroups)
    return new Map(
      uniqueClasses(event).map((eventClass) => [
        eventClass,
        adminRegistrationDates(event, defaultGroups, eventClass).map((date) => ({
          date: date.date,
          key: eventRegistrationDateKey(date),
          time: date.time,
        })),
      ])
    )
  }, [event, eventTypeGroups])
}
