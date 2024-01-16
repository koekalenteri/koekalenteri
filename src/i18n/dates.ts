import type { Language } from '../types'

import { formatDistanceToNowStrict, isSameDay, isSameMonth, isSameYear, isValid, parseISO } from 'date-fns'
import en from 'date-fns/locale/en-GB/index'
import fi from 'date-fns/locale/fi/index'
import { formatInTimeZone } from 'date-fns-tz'

export interface DateFormatOptions {
  tz?: string
  locale?: Locale
}

export const locales: Record<Language, Locale> = { en, fi }

export function formatDate(
  date: Date | string,
  format: string,
  { tz = 'Europe/Helsinki', locale = fi }: DateFormatOptions = {}
): string {
  if (typeof date === 'string') {
    date = parseISO(date)
  }

  if (!isValid(date)) {
    return ''
  }

  return formatInTimeZone(date, tz, format, { locale })
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
  tz = 'Europe/Helsinki'
): string {
  const y = noYear ? '' : 'yyyy'
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
  if (isSameDay(start, end)) {
    return formatInTimeZone(start, tz, `d.M.${y}`)
  }
  if (isSameMonth(start, end)) {
    return formatInTimeZone(start, tz, 'd.') + '–' + formatInTimeZone(end, tz, `d.M.${y}`)
  }
  if (isSameYear(start, end)) {
    return formatInTimeZone(start, tz, 'd.M.') + '–' + formatInTimeZone(end, tz, `d.M.${y}`)
  }
  return formatInTimeZone(start, tz, `d.M.${y}`) + '–' + formatInTimeZone(end, tz, `d.M.${y}`)
}

export function formatDistance(date?: Date, lng?: string): string {
  const locale = locales[lng as Language]
  return formatDistanceToNowStrict(date ?? new Date(), { locale })
}

export const currentFinnishTime = (): string => formatDate(new Date(), "yyyy-MM-dd'T'HH:mm:ssxxx")
