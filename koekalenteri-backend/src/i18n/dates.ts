import { parseISO } from "date-fns"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore https://github.com/date-fns/date-fns/issues/2964
import { enGB as en, fi } from "date-fns/locale/index"
import { formatInTimeZone } from 'date-fns-tz'
import { Language } from "koekalenteri-shared/model"

export const locales: Record<Language, Locale> = { fi, en }

export const formatDate = (fmt: string) =>
  (date: Date | string, lng: string | undefined): string => {
    const locale = locales[lng as Language]
    if (typeof date === 'string') {
      date = parseISO(date)
    }
    return formatInTimeZone(date, 'Europe/Helsinki', fmt, { locale })
  }
