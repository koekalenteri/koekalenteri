import type { DogEvent, RegistrationDate } from '../types'

import { eachDayOfInterval, isSameDay } from 'date-fns'

import { unique } from '../utils'

export const getEventDays = ({ startDate, endDate }: Pick<DogEvent, 'startDate' | 'endDate'>) =>
  eachDayOfInterval({
    start: startDate,
    end: endDate,
  })

export const getUniqueEventClasses = ({ classes }: Pick<DogEvent, 'classes'>) =>
  unique(classes?.map((c) => c?.class) ?? []).filter(Boolean)

export const getEventClassesByDays = (event: Pick<DogEvent, 'startDate' | 'endDate' | 'classes'>) =>
  getEventDays(event).map((day) => ({
    day,
    classes: event.classes?.filter((c) => isSameDay(c.date ?? event.startDate, day)) ?? [],
  }))

export const eventRegistrationDateKey = (rd: RegistrationDate) => rd.date.toISOString().slice(0, 10) + '-' + rd.time
