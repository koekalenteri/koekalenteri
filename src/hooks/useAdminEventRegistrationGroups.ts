import type { PublicDogEvent } from '../types'
import { eventRegistrationDateKey } from '../lib/event'
import { useAdminEventRegistrationDates } from './useAdminEventRegistrationDates'

export const useAdminEventRegistrationGroups = (
  event: Pick<PublicDogEvent, 'classes' | 'endDate' | 'startDate'> & Partial<Pick<PublicDogEvent, 'eventType'>>,
  eventClass?: string
) => {
  const dates = useAdminEventRegistrationDates(event, eventClass)

  return dates.map((date) => ({ ...date, key: eventRegistrationDateKey(date), number: 0 }))
}
