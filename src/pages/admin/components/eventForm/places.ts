import type { DeepPartial, EventClass } from '../../../../types'
import type { PartialEvent } from './types'
import { formatDate } from '../../../../i18n/dates'
import { getEventDays } from '../../../../lib/event'
import { splitEvenly } from '../../../../lib/utils'

type ClassesEvent = Pick<PartialEvent, 'classes'>
type DaysEvent = Pick<PartialEvent, 'endDate' | 'places' | 'startDate'>

/** Calculate total places from classes. */
export function calculateTotalFromClasses(classes: DeepPartial<EventClass>[]): number {
  return classes.reduce((acc, cur) => acc + (cur?.places ?? 0), 0)
}

/** Calculate total places from placesPerDay. */
export function calculateTotalFromDays(placesPerDay: Record<string, number | undefined> = {}): number {
  return Object.values(placesPerDay).reduce((sum: number, places) => sum + (places ?? 0), 0)
}

export function updatePlacesPerDayFromClasses(
  event: ClassesEvent,
  newClasses?: DeepPartial<EventClass>[]
): Record<string, number> {
  const newPlacesPerDay: Record<string, number> = {}
  const classes = newClasses || event.classes
  const classesByDay = new Map<string, DeepPartial<EventClass>[]>()

  for (const cls of classes) {
    if (!cls.date) continue

    const dateStr = formatDate(cls.date, 'yyyy-MM-dd')
    const dayClasses = classesByDay.get(dateStr) || []
    dayClasses.push(cls)
    classesByDay.set(dateStr, dayClasses)
  }

  for (const [dateStr, dayClasses] of classesByDay.entries()) {
    const dayTotal = calculateTotalFromClasses(dayClasses)
    if (dayTotal > 0) newPlacesPerDay[dateStr] = dayTotal
  }

  return newPlacesPerDay
}

export function distributePlacesAmongDays(event: DaysEvent): Record<string, number> {
  const days = getEventDays(event)
  if (days.length === 0) return {}

  const shares = splitEvenly(event.places ?? 0, days.length)
  const placesPerDay: Record<string, number> = {}
  days.forEach((day, index) => {
    placesPerDay[formatDate(day, 'yyyy-MM-dd')] = shares[index]
  })

  return placesPerDay
}

export function distributePlacesAmongClasses(
  classes: DeepPartial<EventClass>[],
  totalPlaces: number
): DeepPartial<EventClass>[] {
  if (!classes?.length) return []

  const shares = splitEvenly(totalPlaces, classes.length)
  return classes.map((cls, index) => ({ ...cls, places: Math.min(shares[index], 200) }))
}
