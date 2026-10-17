import type { Locale } from 'date-fns'
import type { Language } from '../types'
import { tz } from '@date-fns/tz'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { isValid } from 'date-fns/isValid'
import { enGB as en } from 'date-fns/locale/en-GB'
import { fi } from 'date-fns/locale/fi'
import { parseISO } from 'date-fns/parseISO'
import { dayOf, dayStart, isDayKey, TIME_ZONE } from '../lib/day'

interface DateFormatOptions {
  timeZone?: string
  locale?: Locale
}

/**
 * A day with its short weekday, "su 8.11." in Finnish: the `wdshort2` formatter, and the day the
 * audit trail writes into its stored Finnish text. One pattern, so the two cannot drift apart.
 */
export const WEEKDAY_DAY_FORMAT = 'eeeeee d.M.'

export const locales: Record<Language, Locale> = { en, fi }

/**
 * The moment a formatter is given. A string is an ISO instant, or a bare `yyyy-MM-dd`: that is a day,
 * not a moment, and is read as the day it names in the zone, where parseISO would read it as the
 * host's midnight and a viewer east of Finland saw the day before (KOE-1545).
 */
const readMoment = (date: Date | string, timeZone: string): Date => {
  if (typeof date !== 'string') return date
  return isDayKey(date) ? dayStart(date, timeZone) : parseISO(date)
}

/** A moment formatted in `timeZone`; see `readMoment` for what a string stands for. */
export function formatDate(
  date: Date | string,
  formatStr: string,
  { timeZone = TIME_ZONE, locale = fi }: DateFormatOptions = {}
): string {
  date = readMoment(date, timeZone)

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
  start = readMoment(start, timeZone)
  end = readMoment(end, timeZone)
  if (!isValid(start)) {
    return ''
  }
  if (!isValid(end)) {
    end = start
  }
  // The days the span runs between, in the zone: the same day, month and year are the same key prefix.
  const startDay = dayOf(start, timeZone)
  const endDay = dayOf(end, timeZone)
  if (startDay === endDay) {
    return format(start, `${prefix}d.M.${y}${suffix}`, opts)
  }
  if (startDay.slice(0, 7) === endDay.slice(0, 7)) {
    const startFormat = `${prefix}d.`
    const endFormat = `d.M.${y}${suffix}`
    return `${format(start, startFormat, opts)}–${format(end, endFormat, opts)}`
  }
  if (startDay.slice(0, 4) === endDay.slice(0, 4)) {
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
