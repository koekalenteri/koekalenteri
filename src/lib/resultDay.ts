import type { DayKey } from '../types'
import { dayOf, TIME_ZONE } from './day'

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
