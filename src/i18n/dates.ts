import type { Locale } from 'date-fns'
import type { Language } from '../types'
import { tz } from '@date-fns/tz'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { isValid } from 'date-fns/isValid'
import { enGB as en } from 'date-fns/locale/en-GB'
import { fi } from 'date-fns/locale/fi'
import { dayOf, dayParts, hasCalendarDay, localStampToInstant, TIME_ZONE } from '../lib/day'

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
 * The moment a formatter is given. A string with a zone is that instant; a zone-less stamp or a bare
 * `yyyy-MM-dd` is read as the wall-clock time it names in the zone, where parseISO would read it as the
 * host's and a viewer east of Finland saw the day before (KOE-1545).
 */
const readMoment = (date: Date | string, timeZone: string): Date =>
  typeof date === 'string' ? localStampToInstant(date, timeZone) : date

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
  if (!hasCalendarDay(start, timeZone)) {
    return ''
  }
  if (!hasCalendarDay(end, timeZone)) {
    end = start
  }
  // The days the span runs between, in the zone.
  const startDay = dayOf(start, timeZone)
  const endDay = dayOf(end, timeZone)
  const startParts = dayParts(startDay)
  const endParts = dayParts(endDay)
  const sameYear = startParts.year === endParts.year
  if (startDay === endDay) {
    return format(start, `${prefix}d.M.${y}${suffix}`, opts)
  }
  if (sameYear && startParts.month === endParts.month) {
    const startFormat = `${prefix}d.`
    const endFormat = `d.M.${y}${suffix}`
    return `${format(start, startFormat, opts)}–${format(end, endFormat, opts)}`
  }
  if (sameYear) {
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
