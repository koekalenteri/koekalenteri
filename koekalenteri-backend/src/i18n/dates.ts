import { parseISO } from "date-fns";
import { formatInTimeZone } from 'date-fns-tz';
import { enGB as en, fi } from "date-fns/locale";
import { Language } from "koekalenteri-shared/model";

export const locales: Record<Language, Locale> = { en, fi };

export const formatDate = (fmt: string) =>
  (date: Date | string, lng: string | undefined): string => {
    const locale = locales[lng as Language];
    if (typeof date === 'string') {
      date = parseISO(date);
    }
    return formatInTimeZone(date, 'Europe/Helsinki', fmt, { locale });
  };
