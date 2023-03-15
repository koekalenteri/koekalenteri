import { Language } from 'koekalenteri-shared/model'

import { formatDate, locales } from '../utils/dates'

export const createDateFormatter =
  (fmt: string) =>
  (date: Date | string, lng: string | undefined): string => {
    const locale = locales[lng as Language]
    return formatDate(date, fmt, { locale })
  }
