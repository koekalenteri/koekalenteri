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

/** The last millisecond of the Finnish day, as a plain Date. */
export const endOfFinnishDay = (value: Date | DayKey): Date =>
  isDayKey(value) ? dayEnd(value, TIME_ZONE) : dayEndOf(value, TIME_ZONE)
