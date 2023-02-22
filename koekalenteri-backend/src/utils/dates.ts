import { isSameDay, isSameMonth, isSameYear, isValid, lightFormat, parseISO } from "date-fns"
import { DateTime } from "luxon"

export function formatDateSpan(start: Date | string, end: Date | string): string {
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
    return lightFormat(start, 'd.') + '-' + lightFormat(end, 'd.M.yyyy')
  }
  if (isSameYear(start, end)) {
    return lightFormat(start, 'd.M.') + '-' + lightFormat(end, 'd.M.yyyy')
  }
  return lightFormat(start, 'd.M.yyyy') + '-' + lightFormat(end, 'd.M.yyyy')
}

export const currentFinnishTime = (): string => DateTime.now().setZone('Europe/Helsinki').toFormat("y-MM-dd'T'HH:mm:ssZZ")
