import {
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isSameMonth,
  isSameYear,
  isValid,
  lightFormat,
  parseISO,
} from 'date-fns'
import { enGB as en, fi } from 'date-fns/locale'
import { Language } from 'koekalenteri-shared/model'

export const locales: Record<Language, Locale> = { en, fi }

export const formatDate = (date: Date | string, fmt: string, lng?: string): string => {
  const locale = locales[lng as Language]
  if (typeof date === 'string') {
    date = parseISO(date)
  }
  return format(date, fmt, { locale })
}

export const getDateFormatter =
  (fmt: string) =>
  (date: Date | string, lng: string | undefined): string =>
    formatDate(date, fmt, lng)

export function formatDateSpan(start: Date | string, lng: string | undefined, { end }: { end: Date | string }): string {
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
    return lightFormat(start, 'd.M.yyyy')
  }
  if (isSameMonth(start, end)) {
    return lightFormat(start, 'd.') + '–' + lightFormat(end, 'd.M.yyyy')
  }
  if (isSameYear(start, end)) {
    return lightFormat(start, 'd.M.') + '–' + lightFormat(end, 'd.M.yyyy')
  }
  return lightFormat(start, 'd.M.yyyy') + '–' + lightFormat(end, 'd.M.yyyy')
}

export function formatDistance(date?: Date, lng?: string): string {
  const locale = locales[lng as Language]
  return formatDistanceToNowStrict(date ?? new Date(), { locale })
}
