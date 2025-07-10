import type { PartialEvent } from '../pages/admin/components/eventForm/types'
import type { DeepPartial, EventClass } from '../types'

import { formatDate } from '../i18n/dates'

import { getEventDays } from './event'

/**
 * Calculate total places from classes
 */
export function calculateTotalFromClasses(classes: DeepPartial<EventClass>[]): number {
  return classes.reduce((acc, cur) => acc + (cur?.places ?? 0), 0)
}

/**
 * Calculate total places from placesPerDay
 */
export function calculateTotalFromDays(placesPerDay: Record<string, number | undefined> = {}): number {
  return Object.values(placesPerDay).reduce((sum: number, places) => sum + (places ?? 0), 0)
}

/**
 * Update placesPerDay based on classes
 */
export function updatePlacesPerDayFromClasses(
  event: PartialEvent,
  newClasses?: DeepPartial<EventClass>[]
): Record<string, number> {
  const newPlacesPerDay: Record<string, number> = {}
  const classes = newClasses || event.classes

  // Group classes by day and calculate total places per day
  const classesByDay = new Map<string, DeepPartial<EventClass>[]>()

  for (const cls of classes) {
    if (!cls.date) continue

    const dateStr = formatDate(cls.date, 'yyyy-MM-dd')
    const dayClasses = classesByDay.get(dateStr) || []
    dayClasses.push(cls)
    classesByDay.set(dateStr, dayClasses)
  }

  // Calculate total places per day
  for (const [dateStr, dayClasses] of classesByDay.entries()) {
    const dayTotal = calculateTotalFromClasses(dayClasses)
    if (dayTotal > 0) {
      newPlacesPerDay[dateStr] = dayTotal
    }
  }

  return newPlacesPerDay
}

/**
 * Distribute places evenly among days
 */
export function distributePlacesAmongDays(event: PartialEvent): Record<string, number> {
  const days = getEventDays(event)
  if (days.length === 0) return {}

  const places = event.places ?? 0
  const placesPerDay: Record<string, number> = {}
  const placesPerDayValue = Math.floor(places / days.length)

  days.forEach((day, index) => {
    const dateStr = formatDate(day, 'yyyy-MM-dd')
    // Distribute places evenly, with any remainder going to the first day
    placesPerDay[dateStr] = placesPerDayValue + (index === 0 ? places % days.length : 0)
  })

  return placesPerDay
}

/**
 * Distribute places evenly among classes
 */
export function distributePlacesAmongClasses(
  classes: DeepPartial<EventClass>[],
  totalPlaces: number
): DeepPartial<EventClass>[] {
  if (!classes?.length) return []

  const newClasses = classes.map((c) => ({ ...c }))
  const placesPerClassValue = Math.floor(totalPlaces / newClasses.length)

  newClasses.forEach((cls, index) => {
    // Distribute places evenly, with any remainder going to the first day
    cls.places = Math.min(placesPerClassValue + (index === 0 ? totalPlaces % newClasses.length : 0), 200)
  })

  return newClasses
}
