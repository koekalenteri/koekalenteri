import type { DayKey } from '../types'
import { dayOf, TIME_ZONE } from './day'

/**
 * The last day a hand-entered result can have: today in Finland, or the ranking period's last day
 * (`periodEnd`) if that is earlier. A result after the period can never count (KOE-1270). The result's
 * picker and a new result's default date both end here.
 */
export const lastResultDay = (periodEnd: DayKey | undefined): DayKey => {
  const today = dayOf(new Date(), TIME_ZONE)
  if (!periodEnd) return today
  return periodEnd < today ? periodEnd : today
}
