import type { Language } from 'koekalenteri-shared/model'

import { formatDistanceToNowStrict } from 'date-fns'

import { formatDate, locales } from '../utils/dates'

export const createDateFormatter =
  (fmt: string) =>
  (date: Date | string, lng: string | undefined): string => {
    const locale = locales[lng as Language]
    return formatDate(date, fmt, { locale })
  }

export function formatDistance(date?: Date, lng?: string): string {
  const locale = locales[lng as Language]
  return formatDistanceToNowStrict(date ?? new Date(), { locale })
}
