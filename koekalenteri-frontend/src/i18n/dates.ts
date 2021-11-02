import { format, isValid, isSameMonth, lightFormat, isSameDay, parseISO, isSameYear } from "date-fns";
import { enGB as en, fi } from "date-fns/locale";

export const locales = { en, fi };
export type LocaleKey = keyof typeof locales;

export const formatDate = (fmt: string) =>
  (date: Date | string, lng: string | undefined): string => {
    const locale = locales[lng as LocaleKey];
    if (typeof date === 'string') {
      date = parseISO(date);
    }
    return format(date, fmt, { locale });
  };

export function formatDateSpan(start: Date | string, lng: string | undefined, { end }: { end: Date | string}): string {
  if (typeof start === 'string') {
    start = parseISO(start);
  }
  if (typeof end === 'string') {
    end = parseISO(end);
  }
  if (!isValid(start)) {
    return '';
  }
  if (!isValid(end)) {
    end = start;
  }
  if (isSameDay(start, end)) {
    return lightFormat(start, 'd.M.yyyy');
  }
  if (isSameMonth(start, end)) {
    return lightFormat(start, 'd.') + '-' + lightFormat(end, 'd.M.yyyy');
  }
  if (isSameYear(start, end)) {
    return lightFormat(start, 'd.M.') + '-' + lightFormat(end, 'd.M.yyyy');
  }
  return lightFormat(start, 'd.M.yyyy') + '-' + lightFormat(end, 'd.M.yyyy');
}
