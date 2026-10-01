/**
 * Dates relative to today, because the lambdas run on the real clock: an event whose entry closed
 * yesterday is shown as closed however the test pinned its own dates. Days are Helsinki days, the
 * zone every event date is kept in.
 */
const TIME_ZONE = 'Europe/Helsinki'
const DAY_MS = 24 * 60 * 60 * 1000

/** yyyy-MM-dd of the Helsinki day `offset` days from today. */
export const helsinkiDay = (offset = 0): string =>
  new Intl.DateTimeFormat('sv-SE', { day: '2-digit', month: '2-digit', timeZone: TIME_ZONE, year: 'numeric' }).format(
    new Date(Date.now() + offset * DAY_MS)
  )

/** How far Helsinki is ahead of UTC at noon on that day, in hours (2 or 3). */
const helsinkiOffsetHours = (day: string): number => {
  const noon = new Date(`${day}T12:00:00Z`)
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).format(noon)
  )
  return hour - 12
}

/** The instant a Helsinki day starts, as the app stores event dates. */
export const startOfDay = (offset = 0): string => {
  const day = helsinkiDay(offset)
  return new Date(Date.parse(`${day}T00:00:00Z`) - helsinkiOffsetHours(day) * 3600_000).toISOString()
}

/** The last millisecond of a Helsinki day, as the app stores an entry end date. */
export const endOfDay = (offset = 0): string => new Date(Date.parse(startOfDay(offset + 1)) - 1).toISOString()

/** The Helsinki year of an instant: an event's season. */
export const helsinkiYear = (iso: string): string =>
  new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric' }).format(new Date(iso))

/** The day as a group's heading names it, `ti 13.10.`: weekday and day of the Helsinki day of an instant. */
export const groupDay = (iso: string): string =>
  new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', timeZone: TIME_ZONE, weekday: 'short' }).format(
    new Date(iso)
  )
