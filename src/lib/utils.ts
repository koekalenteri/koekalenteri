import type {
  DeepPartial,
  EventState,
  JsonValue,
  PublicContactInfo,
  PublicDogEvent,
  RegistrationDate,
  RegistrationTime,
} from '../types'

import { eachDayOfInterval, endOfDay, startOfDay, subDays } from 'date-fns'
import { diff } from 'deep-object-diff'

type EventVitals = Partial<Pick<PublicDogEvent, 'startDate' | 'endDate' | 'entryStartDate' | 'entryEndDate' | 'state'>>

export const isValidForEntry = (state?: EventState) => !['draft', 'tentative', 'cancelled'].includes(state ?? '')

export const isEventUpcoming = ({ startDate }: EventVitals, now = new Date()) => !!startDate && startDate > now

export const isEntryUpcoming = ({ entryStartDate, state }: EventVitals, now = new Date()) =>
  !!entryStartDate && entryStartDate > now && isValidForEntry(state)

export const isEntryOpen = ({ entryStartDate, entryEndDate, state }: EventVitals, now = new Date()) =>
  !!entryStartDate &&
  !!entryEndDate &&
  startOfDay(entryStartDate) <= now &&
  endOfDay(entryEndDate) >= now &&
  isValidForEntry(state)

export const isEntryClosing = (event: EventVitals, now = new Date()) =>
  !!event.entryEndDate &&
  isEntryOpen(event, now) &&
  subDays(event.entryEndDate, 7) <= endOfDay(now) &&
  isValidForEntry(event.state)

export const isEntryClosed = ({ startDate, entryEndDate }: EventVitals, now = new Date()) =>
  !!startDate && !!entryEndDate && endOfDay(entryEndDate) < now && startOfDay(startDate) > now

export const isEventOngoing = ({ startDate, endDate, state }: EventVitals, now = new Date()) =>
  !!startDate &&
  !!endDate &&
  startOfDay(startDate) <= now &&
  endOfDay(endDate) >= now &&
  isValidForEntry(state) &&
  state !== 'confirmed'

export const isEventOver = ({ endDate }: EventVitals, now = new Date()) => !!endDate && endOfDay(endDate) < now

export const eventDates = (event?: Pick<PublicDogEvent, 'classes' | 'startDate' | 'endDate'>) => {
  if (!event) return []
  return event.classes.length
    ? uniqueDate(event.classes.map((c) => c.date ?? event.startDate))
    : eachDayOfInterval({ start: event.startDate, end: event.endDate })
}

export const uniqueClasses = (event?: Pick<PublicDogEvent, 'classes'>) =>
  unique((event?.classes ?? []).map((c) => c.class))

export const placesForClass = (
  event: DeepPartial<Pick<PublicDogEvent, 'places' | 'classes'>> | undefined,
  cls: string
) => {
  if (!event) {
    return 0
  }

  return (
    (event.classes ?? []).filter((c) => c.class === cls).reduce((acc, cur) => acc + (Number(cur.places) || 0), 0) ||
    Number(event.places) ||
    0
  )
}

export const uniqueClassDates = (event: PublicDogEvent, cls: string) =>
  cls === event.eventType
    ? eventDates(event)
    : uniqueDate(event.classes.filter((c) => c.class === cls).map((c) => c.date ?? event.startDate))

export const registrationDates = (event: PublicDogEvent, times: RegistrationTime[], cls?: string) =>
  (cls ? uniqueClassDates(event, cls) : eventDates(event)).flatMap<RegistrationDate>((date) =>
    times.map((time) => ({ date, time }))
  )

export const unique = <T = string>(arr: T[]): T[] => arr.filter((c, i, a) => a.indexOf(c) === i)

export const uniqueFn = <T>(arr: T[], cmp: (a: T, b: T) => boolean): T[] =>
  arr.filter((c, i, a) => a.findIndex((f) => cmp(f, c)) === i)

export const uniqueDate = (arr: Date[]) => [...new Set<number>(arr.map((d) => d.valueOf()))].map((v) => new Date(v))

const DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:[0-2][1-9]|[1-3]0|3[01])$/
const TIME_RE = /^(?:[0-1]\d|2[0-3])(?::[0-6]\d)(?::[0-6]\d)?(?:\.\d{3})?(?:[+-][0-2]\d:[0-5]\d|Z)?$/

export const isDateString = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false
  }
  const [date, time] = value.split('T')
  return DATE_RE.test(date) && TIME_RE.test(time)
}

function dateReviver(_key: string, value: JsonValue): JsonValue | Date {
  if (isDateString(value)) {
    const dateObj = new Date(value)
    if (!isNaN(+dateObj)) {
      return dateObj
    }
  }
  return value
}

export const parseJSON = (json: string, reviveDates: boolean = true) =>
  json ? JSON.parse(json, reviveDates ? dateReviver : undefined) : undefined

export type AnyObject = Record<string, any>
export type EmptyObject = Record<string, never>
export type Entries<T> = {
  [K in keyof T]: [K, T[K]]
}[keyof T][]

export const isEmpty = (o: AnyObject): o is EmptyObject => Object.keys(o).length === 0

export const isObject = (o: unknown): o is AnyObject =>
  o !== null && Object.prototype.toString.call(o) === '[object Object]'

export const isEmptyObject = (o: unknown): o is EmptyObject => isObject(o) && isEmpty(o)

export const hasChanges = (a: object | undefined | null, b: object | undefined | null): boolean =>
  !isEmptyObject(diff(a ?? {}, b ?? {}))

export const clone = <T extends AnyObject>(a: T): T => ({ ...a })

export const merge = <T extends AnyObject>(a: T, b: DeepPartial<T>): T => {
  const result = isObject(a) ? clone(a) : ({} as T)
  if (!isObject(b)) {
    return result
  }
  for (const [key, value] of Object.entries(b) as Entries<T>) {
    if (isObject(value)) {
      const old = result[key]
      result[key] = isObject(old) ? merge(old, value) : value
    } else {
      result[key] = value
    }
  }
  return result
}

export const printContactInfo = (info?: PublicContactInfo) =>
  [info?.name, info?.phone, info?.email].filter(Boolean).join(', ')
