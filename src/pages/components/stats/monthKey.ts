import { monthOf, TIME_ZONE } from '@/lib/day'

/** The Finnish month a stats row falls in, as `yyyy-MM`, or undefined for a row without a date. */
export const monthKey = (date?: Date): string | undefined => (date ? monthOf(date, TIME_ZONE) : undefined)
