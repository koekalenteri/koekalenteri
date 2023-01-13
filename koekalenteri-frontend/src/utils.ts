import { eachDayOfInterval, endOfDay, startOfDay, subDays } from 'date-fns'
import { Event, JsonValue, RegistrationDate } from 'koekalenteri-shared/model'

type EventDates = {
  startDate?: Date
  endDate?: Date
  entryStartDate?: Date
  entryEndDate?: Date
}

export const isEventUpcoming = ({ startDate }: EventDates, now = new Date()) => !!startDate && startDate > now

export const isEntryUpcoming = ({ entryStartDate }: EventDates, now = new Date()) => !!entryStartDate && entryStartDate > now
export const isEntryOpen = ({ entryStartDate, entryEndDate }: EventDates, now = new Date()) => !!entryStartDate && !!entryEndDate && startOfDay(entryStartDate) <= now && endOfDay(entryEndDate) >= now
export const isEntryClosing = ({ entryStartDate, entryEndDate }: EventDates, now = new Date()) => !!entryEndDate && isEntryOpen({ entryStartDate, entryEndDate }, now) && subDays(entryEndDate, 7) <= endOfDay(now)
export const isEntryClosed = ({ startDate, entryEndDate }: EventDates, now = new Date()) => !!startDate && !!entryEndDate && endOfDay(entryEndDate) < now && startOfDay(startDate) > now

export const isEventOngoing = ({ startDate, endDate }: EventDates, now = new Date()) => !!startDate && !!endDate && startDate <= now && endDate >= now
export const isEventOver = ({ startDate }: EventDates, now = new Date()) => !!startDate && startDate < now

export const eventDates = (event: Event) => event.classes.length ? uniqueDate(event.classes.map(c => c.date ?? event.startDate)) : eachDayOfInterval({ start: event.startDate, end: event.endDate })
export const uniqueClasses = (event?: Event) => unique((event?.classes ?? []).map(c => c.class))
export const uniqueClassDates = (event: Event, cls: string) => uniqueDate(event.classes.filter(c => c.class === cls).map(c => c.date ?? event.startDate))
export const registrationDates = (event: Event, cls?: string) => (cls ? uniqueClassDates(event, cls) : eventDates(event)).flatMap<RegistrationDate>(date => [{ date, time: 'ap' }, { date, time: 'ip' }])

export function entryDateColor(event: Event) {
  if (!isEntryOpen(event)) {
    return 'text.primary'
  }
  return isEntryClosing(event) ? 'warning.main' : 'success.main'
}

export const unique = <T = string>(arr: T[]): T[] => arr.filter((c, i, a) => a.indexOf(c) === i)
export const uniqueFn = <T>(arr: T[], cmp: (a: T, b: T) => boolean): T[] => arr.filter((c, i, a) => a.findIndex(f => cmp(f, c)) === i)
export const uniqueDate = (arr: Date[]) => [...new Set<number>(arr.map(d => d.valueOf()))].map(v => new Date(v))

function dateReviver(_key: string, value: JsonValue): JsonValue | Date {
  if (typeof value === 'string' && /^\d{4}-[01]\d-[0-3]\dT[012]\d(?::[0-6]\d){2}\.\d{3}Z$/.test(value)) {
    const date = new Date(value)
    if (!isNaN(+date)) {
      return date
    }
  }
  return value
}

export const parseJSON = (json: string) => json ? JSON.parse(json, dateReviver) : undefined
