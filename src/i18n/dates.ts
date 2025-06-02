import type { Locale } from 'date-fns'
import type { Language } from '../types'

import { tz } from '@date-fns/tz'
import {
  endOfDay,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isSameMonth,
  isSameYear,
  isValid,
  parse,
  parseISO,
  startOfDay,
} from 'date-fns'
import { enGB as en, fi } from 'date-fns/locale'

type DateType = Date | number | string

interface DateFormatOptions {
  timeZone?: string
  locale?: Locale
}

export const TIME_ZONE = 'Europe/Helsinki'

export const locales: Record<Language, Locale> = { en, fi }

export function formatDate(
  date: Date | string,
  formatStr: string,
  { timeZone = TIME_ZONE, locale = fi }: DateFormatOptions = {}
): string {
  if (typeof date === 'string') {
    date = parseISO(date)
  }

  if (!isValid(date)) {
    return ''
  }

  return format(date, formatStr, { in: tz(timeZone), locale })
}

export const getDateFormatter =
  (fmt: string) =>
  (date: Date | string, lng: string | undefined): string => {
    const locale = locales[lng as Language]

    return formatDate(date, fmt, { locale })
  }

export function formatDateSpan(
  start: Date | string,
  lng: string | undefined,
  { end, noYear }: { end: Date | string; noYear?: boolean },
  timeZone = TIME_ZONE
): string {
  const y = noYear ? '' : 'yyyy'
  const opts = { in: tz(timeZone) }
  if (typeof start === 'string') {
    start = parseISO(start)
  }
  if (typeof end === 'string') {
    end = parseISO(end)
  }
  if (!isValid(start)) {
    return ''
  }
  if (!isValid(end)) {
    end = start
  }
  if (isSameDay(start, end, opts)) {
    return format(start, `d.M.${y}`, opts)
  }
  if (isSameMonth(start, end, opts)) {
    return format(start, 'd.', opts) + '–' + format(end, `d.M.${y}`, opts)
  }
  if (isSameYear(start, end)) {
    return format(start, 'd.M.', opts) + '–' + format(end, `d.M.${y}`, opts)
  }
  return format(start, `d.M.${y}`, opts) + '–' + format(end, `d.M.${y}`, opts)
}

export function formatDistance(date?: Date, lng?: string): string {
  const locale = locales[lng as Language]
  return formatDistanceToNowStrict(date ?? new Date(), { locale })
}

export const currentFinnishTime = (): string => formatDate(new Date(), "yyyy-MM-dd'T'HH:mm:ssxxx")

export const zonedStartOfDay = (date: DateType, timeZone = TIME_ZONE) => startOfDay(date, { in: tz(timeZone) })
export const zonedEndOfDay = (date: DateType, timeZone = TIME_ZONE) => endOfDay(date, { in: tz(timeZone) })
export const zonedDateString = (date: Date, timeZone = TIME_ZONE) => formatDate(date, 'yyyy-MM-dd', { timeZone })
export const zonedParseDate = (dateStr: string, timeZone = TIME_ZONE) =>
  parse(dateStr, 'yyyy-MM-dd', new Date(), { in: tz(timeZone) })
