import { eachDayOfInterval, endOfDay, startOfDay, subDays } from 'date-fns'
import { diff } from 'deep-object-diff'
import { DeepPartial, Event, JsonValue, RegistrationDate } from 'koekalenteri-shared/model'
import { toASCII } from 'punycode'

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
export const uniqueClassDates = (event: Event, cls: string) => cls === event.eventType ? eventDates(event) : uniqueDate(event.classes.filter(c => c.class === cls).map(c => c.date ?? event.startDate))
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
  if (typeof value === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])-(?:[0-2][1-9]|[1-3]0|3[01])T(?:[0-1][0-9]|2[0-3])(?::[0-6]\d)(?::[0-6]\d)?(?:\.\d{3})?(?:[+-][0-2]\d:[0-5]\d|Z)?$/.test(value)) {
    const date = new Date(value)
    if (!isNaN(+date)) {
      return date
    }
  }
  return value
}

export const parseJSON = (json: string) => json ? JSON.parse(json, dateReviver) : undefined


export type AnyObject = Record<string, unknown>
export type EmptyObject = Record<string, never>
export type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export const isEmpty = (o: AnyObject): o is EmptyObject => Object.keys(o).length === 0
export const isObject = (o: unknown): o is AnyObject => o !== null && Object.prototype.toString.call(o) === '[object Object]'
export const isEmptyObject = (o: unknown): o is EmptyObject => isObject(o) && isEmpty(o)
export const hasChanges = (a: object | undefined, b: object | undefined): boolean => !isEmptyObject(diff(a ?? {}, b ?? {}))
export const clone = <T extends AnyObject>(a: T): T => Object.assign({}, a)
export const merge = <T>(a: T, b: DeepPartial<T>): T => {
  const result = isObject(a) ? clone(a) : {} as T
  if (!isObject(b)) {
    return result
  }
  for (const [key, value] of Object.entries(b) as Entries<T>) {
    if (key === 'results') {
      console.log(key, value, result[key])
    }
    if (isObject(value)) {
      const old = result[key]
      // @ts-expect-error Argument of type 'T[keyof T] & AnyObject' is not assignable to parameter of type 'DeepPartial<T[keyof T] & AnyObject>'
      result[key] = isObject(old) ? merge(old, value) : value
    } else {
      result[key] = value
    }
  }
  return result
}

const USEREXP = /^[a-z0-9!#$%&'*+-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+-/=?^_`{|}~]+)*$/i
const DOMAINEXP = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i
export const validEmail = (email: string) => {
  const parts = email.split('@')

  if (parts.length !== 2) {
    return false
  }

  const [user, domain] = parts
  if (user.match(USEREXP) === null) {
    return false
  }

  const asciiDomain = toASCII(domain) // allow internationalized domain name
  if (asciiDomain.match(DOMAINEXP) === null) {
    return false
  }

  // this is not RFC, but lets require a dot in the domain part anyway
  if (!asciiDomain.includes('.')) {
    return false
  }

  return true
}
