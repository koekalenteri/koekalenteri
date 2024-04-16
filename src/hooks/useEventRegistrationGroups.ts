import type { PublicDogEvent } from '../types'

import { eventRegistrationDateKey } from '../lib/event'

import { useEventRegistrationDates } from './useEventRegistrationDates'

export const useEventRegistrationGroups = (
  event: Pick<PublicDogEvent, 'classes' | 'endDate' | 'startDate'> & Partial<Pick<PublicDogEvent, 'eventType'>>,
  eventClass?: string
) => {
  const dates = useEventRegistrationDates(event, eventClass)

  return dates.map((date) => ({ ...date, key: eventRegistrationDateKey(date), number: 0 }))
}
