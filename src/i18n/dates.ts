import type { Locale } from 'date-fns'
import type { Language } from '../types'
import { tz } from '@date-fns/tz'
import { addDays } from 'date-fns/addDays'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { endOfDay } from 'date-fns/endOfDay'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { isSameDay } from 'date-fns/isSameDay'
import { isSameMonth } from 'date-fns/isSameMonth'
import { isSameYear } from 'date-fns/isSameYear'
import { isValid } from 'date-fns/isValid'
import { enGB as en } from 'date-fns/locale/en-GB'
import { fi } from 'date-fns/locale/fi'
import { parse } from 'date-fns/parse'
import { parseISO } from 'date-fns/parseISO'
import { startOfDay } from 'date-fns/startOfDay'

type DateType = Date | number | string

interface DateFormatOptions {
  timeZone?: string
  locale?: Locale
}

export const TIME_ZONE = 'Europe/Helsinki'

/**
 * A day with its short weekday, "su 8.11." in Finnish: the `wdshort2` formatter, and the day the
 * audit trail writes into its stored Finnish text. One pattern, so the two cannot drift apart.
 */
export const WEEKDAY_DAY_FORMAT = 'eeeeee d.M.'

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
  _lng: string | undefined,
  { end, noYear, parentheses }: { end: Date | string; noYear?: boolean; parentheses?: boolean },
  timeZone = TIME_ZONE
): string {
  const y = noYear ? '' : 'yyyy'
  const prefix = parentheses ? '(' : ''
  const suffix = parentheses ? ')' : ''
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
    return format(start, `${prefix}d.M.${y}${suffix}`, opts)
  }
  if (isSameMonth(start, end, opts)) {
    const startFormat = `${prefix}d.`
    const endFormat = `d.M.${y}${suffix}`
    return `${format(start, startFormat, opts)}–${format(end, endFormat, opts)}`
  }
  if (isSameYear(start, end)) {
    const startFormat = `${prefix}d.M.`
    const endFormat = `d.M.${y}${suffix}`
    return `${format(start, startFormat, opts)}–${format(end, endFormat, opts)}`
  }
  const startFormat = `${prefix}d.M.${y}`
  const endFormat = `d.M.${y}${suffix}`
  return `${format(start, startFormat, opts)}–${format(end, endFormat, opts)}`
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

/** Whole Finnish calendar days from `from` to `to`; an hour of daylight saving never turns a day into 23 or 25 hours. */
export const finnishDaysBetween = (from: DateType, to: DateType, timeZone = TIME_ZONE) =>
  differenceInCalendarDays(to, from, { in: tz(timeZone) })

/** `date` moved by whole Finnish calendar days, keeping its Finnish wall-clock time, as an ISO instant. */
export const addFinnishDays = (date: DateType, days: number, timeZone = TIME_ZONE) =>
  // A TZDate prints its own offset ("+03:00"); the stored form is the UTC instant.
  new Date(addDays(date, days, { in: tz(timeZone) }).getTime()).toISOString()
