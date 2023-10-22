import type { Locale } from 'date-fns'
import type { Language } from '../../types'

import { isSameDay, isSameMonth, isSameYear, isValid, parseISO } from 'date-fns'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore https://github.com/date-fns/date-fns/issues/2964
import { enGB as en, fi } from 'date-fns/locale/index'
import { formatInTimeZone } from 'date-fns-tz'

export const locales: Record<Language, Locale> = { fi, en }
export interface DateFormatOptions {
  tz?: string
  locale?: Locale
}

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

export function formatDateSpan(
  start: Date | string,
  lng: string | undefined,
  { end }: { end: Date | string },
  tz = 'Europe/Helsinki'
): string {
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
    return formatInTimeZone(start, tz, 'd.M.yyyy')
  }
  if (isSameMonth(start, end)) {
    return formatInTimeZone(start, tz, 'd.') + '-' + formatInTimeZone(end, tz, 'd.M.yyyy')
  }
  if (isSameYear(start, end)) {
    return formatInTimeZone(start, tz, 'd.M.') + '-' + formatInTimeZone(end, tz, 'd.M.yyyy')
  }
  return formatInTimeZone(start, tz, 'd.M.yyyy') + '-' + formatInTimeZone(end, tz, 'd.M.yyyy')
}

export const currentFinnishTime = (): string => formatDate(new Date(), "yyyy-MM-dd'T'HH:mm:ssxxx")
