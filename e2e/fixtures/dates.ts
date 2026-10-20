import type { DayKey } from '../../src/types'
import { addDays, dayOf, dayStart, TIME_ZONE } from '../../src/lib/day'

/**
 * Dates relative to today, because the lambdas run on the real clock: an event whose entry closed
 * yesterday is shown as closed however the test pinned its own dates. Days are Finnish days, the
 * days every event date is kept in, counted and bounded by the app's own day module.
 */

/** The Helsinki day `offset` days from today, as the app stores every calendar day (KOE-1547). */
export const helsinkiDay = (offset = 0): DayKey => addDays(dayOf(Date.now(), TIME_ZONE), offset)

/** The year of a day: an event's season. */
export const helsinkiYear = (day: DayKey): string => day.slice(0, 4)

/** The day as a group's heading names it, `ti 13.10.`: weekday and day of a Helsinki day. */
export const groupDay = (day: DayKey): string =>
  new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', timeZone: TIME_ZONE, weekday: 'short' }).format(
    dayStart(day, TIME_ZONE)
  )
