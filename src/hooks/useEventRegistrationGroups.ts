import type { DogEvent } from '../types'

import { eventRegistrationDateKey } from '../lib/event'

import { useEventRegistrationDates } from './useEventRegistrationDates'

export const useEventRegistrationGroups = (event: DogEvent, eventClass?: string) => {
  const dates = useEventRegistrationDates(event, eventClass)

  return dates.map((date) => ({ ...date, key: eventRegistrationDateKey(date), number: 0 }))
}
