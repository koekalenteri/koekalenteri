import type { DayKey } from '../types'
import { dayEnd, dayEndOf, dayOf, dayStart, dayStartOf, isDayKey, TIME_ZONE } from '../lib/day'

/**
 * Fixture helpers for the trials' zone. A test names its days as Finnish days, so these take a day key
 * as it is and read a moment by the Finnish day it falls on; production code passes the zone itself
 * (src/lib/day.ts) and has no such default.
 */

/** The Finnish day of a fixture value. */
export const finnishDayOf = (value: Date | DayKey): DayKey => (isDayKey(value) ? value : dayOf(value, TIME_ZONE))

/** The Finnish midnight that begins the day, as a plain Date: a fixture's stored form. */
export const startOfFinnishDay = (value: Date | DayKey): Date =>
  isDayKey(value) ? dayStart(value, TIME_ZONE) : dayStartOf(value, TIME_ZONE)

/**
 * Finnish noon of the day: twelve hours into it, which is the same calendar day from UTC-9 to UTC+13.
 * For fixtures a browser-zone picker shows, and for a frozen clock that no host zone tips onto a neighbour.
 */
export const noonOfFinnishDay = (day: DayKey): Date => new Date(dayStart(day, TIME_ZONE).getTime() + 12 * 3_600_000)

/** The last millisecond of the Finnish day, as a plain Date. */
export const endOfFinnishDay = (value: Date | DayKey): Date =>
  isDayKey(value) ? dayEnd(value, TIME_ZONE) : dayEndOf(value, TIME_ZONE)

/**
 * A value a day field held, or a request sent, before KOE-1547 made every stored day a key: an instant,
 * a Kennelliitto stamp, an unreadable value. It is not a key; it is typed as the `DayKey` the field now
 * claims, so a fixture of an unmigrated row or an older browser's request can hold it, for the tests of
 * the migrations and of the readers and request boundaries that still accept those forms. The value is
 * returned as it is (a JSON round trip, which a stored row also goes through, gives it the type).
 */
export const legacyDayValue = (value: string): DayKey => JSON.parse(JSON.stringify(value))
