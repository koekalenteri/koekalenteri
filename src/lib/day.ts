import type { DayKey } from '../types'
import { TZDate, tz } from '@date-fns/tz'
import { addDays as addDaysInZone } from 'date-fns/addDays'
import { toDayKey } from '../types'

/**
 * The trials' zone. Every day the calendar stores or shows is a Finnish day, so this is the zone the
 * callers pass; nothing here defaults to it, because a forgotten zone is a silent host-zone read.
 */
export const TIME_ZONE = 'Europe/Helsinki'

const MS_PER_DAY = 86_400_000

/*
 * The day arithmetic below runs on the UTC calendar: a day key is placed at its UTC midnight, moved,
 * and read back with the UTC getters. UTC has no change of time, so a step of a day is always
 * 24 hours there, and the host's zone never enters. Only `dayOf`, `dayStart`, `dayEnd` and
 * `shiftDays` deal in zones, and they take the zone as a parameter.
 */

/** The year, month (1 to 12) and day of a key. */
export const dayParts = (day: DayKey) => {
  const [year, month, date] = day.split('-').map(Number)
  return { day: date, month, year }
}

const utcMidnight = (day: DayKey) => {
  const { year, month, day: date } = dayParts(day)
  return Date.UTC(year, month - 1, date)
}

const fromUtc = (ms: number) => {
  const d = new Date(ms)
  return toDayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** The day `days` days after `day` (before it for a negative count). */
export const addDays = (day: DayKey, days: number): DayKey => fromUtc(utcMidnight(day) + days * MS_PER_DAY)

/**
 * The day `months` months from `day`, clamped to the last day of the month it lands in: a month
 * after 31.1. is 28.2., a year after 29.2.2024 is 28.2.2025, as date-fns counts them.
 */
export const addMonths = (day: DayKey, months: number): DayKey => {
  const { year, month, day: date } = dayParts(day)
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastOfTarget = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)
  ).getUTCDate()
  return toDayKey(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, Math.min(date, lastOfTarget))
}

/** Whole days from `from` to `to`: positive when `to` is later, negative when earlier. */
export const daysBetween = (from: DayKey, to: DayKey): number =>
  Math.round((utcMidnight(to) - utcMidnight(from)) / MS_PER_DAY)

/** Every day from `from` to `to`, both included; nothing when `to` is before `from`. */
export const eachDay = (from: DayKey, to: DayKey): DayKey[] => {
  const days: DayKey[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day)
  }
  return days
}

/** The weekday of the key as `Date` counts them: 0 is Sunday, 6 is Saturday. */
export const dayOfWeek = (day: DayKey): number => new Date(utcMidnight(day)).getUTCDay()

/**
 * The day the instant falls on in `zone`. An invalid instant has no day and throws; a caller that
 * holds a value from storage or a request checks it first.
 */
export const dayOf = (instant: Date | number, zone: string): DayKey => {
  const zoned = new TZDate(Number(instant), zone)
  if (Number.isNaN(zoned.getTime())) throw new RangeError('Not an instant')
  return toDayKey(zoned.getFullYear(), zoned.getMonth() + 1, zoned.getDate())
}

/**
 * The first moment of the day in `zone`, as a plain Date (the stored form is the UTC instant). Built
 * through the zone's own clock, so where a change of time falls on midnight the day starts at the
 * first moment the zone has.
 */
export const dayStart = (day: DayKey, zone: string): Date => {
  const { year, month, day: date } = dayParts(day)
  return new Date(new TZDate(year, month - 1, date, zone).getTime())
}

/** The last millisecond of the day in `zone`: a day of 23 or 25 hours ends where the next one starts. */
export const dayEnd = (day: DayKey, zone: string): Date => new Date(dayStart(addDays(day, 1), zone).getTime() - 1)

/**
 * The instant moved by whole calendar days of `zone`, keeping its wall-clock time there: midnight
 * stays midnight and 23:59:59.999 stays so across a change of time, where 24-hour steps would land
 * an hour off. For a day that is known to start or end the result, prefer `dayStart`/`dayEnd` of
 * `addDays`; this is for stored instants whose time of day is to be kept as it is.
 */
export const shiftDays = (instant: Date, days: number, zone: string): Date =>
  new Date(addDaysInZone(instant, days, { in: tz(zone) }).getTime())
