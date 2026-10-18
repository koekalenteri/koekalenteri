import type { DayKey } from '../types'
import { dayOf, hasCalendarDay, hasLocalDay, localDayOf, TIME_ZONE } from './day'

/*
 * The day a dog's test result counts for, by the kind of result. Its own module because the rules read
 * it (`rules_ch.ts`), and `dog.ts`, where the dog's other dates are read, imports the rules.
 */

/**
 * The day an official result was written on. Kennelliitto's `aika` has no zone, and both the browser's
 * typed boundary and the lambda's `new Date` read it as local time, so its local day (`localDayOf`) is
 * the day written on it in any host zone; read in Finnish time, it would move a day back east of
 * Finland. Undefined for a date that has no day: an invalid one, or the Kennel Club's empty 0001-01-01.
 * The results move to day keys in KOE-1547 and KOE-1548, and this reader with them.
 */
export const officialResultDay = (date: Date): DayKey | undefined => (hasLocalDay(date) ? localDayOf(date) : undefined)

/**
 * The day a hand-entered result counts for: its Finnish day. The form sends the picked date as an
 * instant (`toISOString`), so the browser and the lambda agree only when both read it in one zone.
 * Undefined for a date that has no day.
 */
export const manualResultDay = (date: Date): DayKey | undefined =>
  hasCalendarDay(date, TIME_ZONE) ? dayOf(date, TIME_ZONE) : undefined

/**
 * The last day a hand-entered result can have: today in Finland, or the last Finnish day of the
 * ranking period (`periodEnd`, its last moment) if that is earlier. A result after the period can
 * never count (KOE-1270). The result's picker and a new result's default date both end here; read as
 * an instant, the period's end was the next day east of Finland (KOE-1548).
 */
export const lastResultDay = (periodEnd: Date | undefined): DayKey => {
  const today = dayOf(new Date(), TIME_ZONE)
  if (!periodEnd) return today
  const periodLastDay = dayOf(periodEnd, TIME_ZONE)
  return periodLastDay < today ? periodLastDay : today
}
