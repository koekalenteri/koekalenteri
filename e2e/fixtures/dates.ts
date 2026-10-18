import type { DayKey } from '../../src/types'
import { addDays, dayEnd, dayOf, dayStart, TIME_ZONE, yearOf } from '../../src/lib/day'

/**
 * Dates relative to today, because the lambdas run on the real clock: an event whose entry closed
 * yesterday is shown as closed however the test pinned its own dates. Days are Finnish days, the
 * days every event date is kept in, counted and bounded by the app's own day module.
 */

/** The Helsinki day `offset` days from today. */
export const helsinkiDay = (offset = 0): DayKey => addDays(dayOf(Date.now(), TIME_ZONE), offset)

/** The instant a Helsinki day starts, as the app stores event dates. */
export const startOfDay = (offset = 0): string => dayStart(helsinkiDay(offset), TIME_ZONE).toISOString()

/** The last millisecond of a Helsinki day, as the app stores an entry end date. */
export const endOfDay = (offset = 0): string => dayEnd(helsinkiDay(offset), TIME_ZONE).toISOString()

/** The Helsinki year of an instant: an event's season. */
export const helsinkiYear = (iso: string): string => String(yearOf(new Date(iso), TIME_ZONE))

/** The day as a group's heading names it, `ti 13.10.`: weekday and day of the Helsinki day of an instant. */
export const groupDay = (iso: string): string =>
  new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', timeZone: TIME_ZONE, weekday: 'short' }).format(
    new Date(iso)
  )
