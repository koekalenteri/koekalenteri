import type { Event } from '../types'

import { eachDayOfInterval, isSameDay } from 'date-fns'

import { unique } from '../utils'

export const eventDays = ({ startDate, endDate }: Pick<Event, 'startDate' | 'endDate'>) =>
  eachDayOfInterval({
    start: startDate,
    end: endDate,
  })

export const eventClasses = ({ classes }: Pick<Event, 'classes'>) =>
  unique(classes?.map((c) => c?.class)).filter(Boolean)

export const eventClassesByDays = (event: Pick<Event, 'startDate' | 'endDate' | 'classes'>) =>
  eventDays(event).map((day) => ({
    day,
    classes: event.classes?.filter((c) => isSameDay(c.date ?? event.startDate, day)) ?? [],
  }))
