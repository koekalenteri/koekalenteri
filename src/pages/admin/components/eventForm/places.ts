import type { DeepPartial, EventClass } from '../../../../types'
import type { PartialEvent } from './types'
import { formatDate } from '../../../../i18n/dates'
import { getEventDays } from '../../../../lib/event'
import { splitEvenly } from '../../../../lib/utils'

type ClassesEvent = Pick<PartialEvent, 'classes'>
type DaysEvent = Pick<PartialEvent, 'endDate' | 'places' | 'startDate'>

/** NOME-B trials track capacity per class rather than as a single event-wide or per-day total. */
export function requiresClassPlaces(event: Pick<PartialEvent, 'eventType'>): boolean {
  return event.eventType === 'NOME-B'
}

/**
 * A class-day entry whose `groups` (ap/ip/kp) were explicitly emptied via the class-groups
 * picker was deselected for that day and isn't actually offered. `groups` being `undefined`
 * means the picker isn't in use for this class, so it's treated as active (backward compatible
 * with classes/mocks that never set it).
 */
export function isClassDateActive(cls: Pick<DeepPartial<EventClass>, 'groups'>): boolean {
  return cls.groups === undefined || cls.groups.length > 0
}

/** Calculate total places from classes, ignoring class-day entries that aren't actually offered. */
export function calculateTotalFromClasses(classes: DeepPartial<EventClass>[]): number {
  return classes.reduce((acc, cur) => acc + (cur && isClassDateActive(cur) ? (cur.places ?? 0) : 0), 0)
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

/** Split places evenly among classes, skipping class-day entries that aren't actually offered. */
export function distributePlacesAmongClasses(
  classes: DeepPartial<EventClass>[],
  totalPlaces: number
): DeepPartial<EventClass>[] {
  if (!classes?.length) return []

  const activeCount = classes.filter(isClassDateActive).length
  const shares = splitEvenly(totalPlaces, activeCount)
  let activeIndex = 0
  return classes.map((cls) => {
    if (!isClassDateActive(cls)) return { ...cls, places: 0 }
    return { ...cls, places: Math.min(shares[activeIndex++], 200) }
  })
}

/** Split each day's placesPerDay total evenly among that day's classes, preserving per-day totals. */
export function distributePlacesAmongClassesPerDay(
  classes: DeepPartial<EventClass>[],
  placesPerDay: Record<string, number | undefined> = {}
): DeepPartial<EventClass>[] {
  if (!classes?.length) return []

  const result = classes.map((cls) => ({ ...cls }))
  const classesByDay = new Map<string, DeepPartial<EventClass>[]>()

  for (const cls of result) {
    if (!cls.date) continue

    const dateStr = formatDate(cls.date, 'yyyy-MM-dd')
    const dayClasses = classesByDay.get(dateStr) || []
    dayClasses.push(cls)
    classesByDay.set(dateStr, dayClasses)
  }

  for (const [dateStr, dayClasses] of classesByDay.entries()) {
    const activeClasses = dayClasses.filter(isClassDateActive)
    const shares = splitEvenly(placesPerDay[dateStr] ?? 0, activeClasses.length)
    activeClasses.forEach((cls, index) => {
      cls.places = Math.min(shares[index], 200)
    })
    for (const cls of dayClasses) {
      if (!isClassDateActive(cls)) cls.places = 0
    }
  }

  return result
}
