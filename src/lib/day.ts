import type { DayKey } from '../types'
import { TZDate, tz } from '@date-fns/tz'
import { addDays as addDaysInZone } from 'date-fns/addDays'
import { parseISO } from 'date-fns/parseISO'

/**
 * The trials' zone. Every day the calendar stores or shows is a Finnish day, so this is the zone the
 * callers pass; nothing here defaults to it, because a forgotten zone is a silent host-zone read.
 */
export const TIME_ZONE = 'Europe/Helsinki'

const MS_PER_DAY = 86_400_000

/*
 * The day arithmetic below runs on the UTC calendar: a day key is placed at its UTC midnight, moved,
 * and read back with the UTC getters. UTC has no change of time, so a step of a day is always
 * 24 hours there, and the host's zone never enters. Only the functions that take a zone deal in
 * zones: `dayOf`, `dayStart`, `dayEnd` and the readers built on them, and `shiftDays`.
 */

/**
 * The years, in one place. A key can spell 1000 to 9999 (four digits; the Date constructors would read
 * a year below 100 as 19xx). A day is accepted from storage, a URL or a request (`isDayKey`,
 * `hasCalendarDay`) only a century inside that, so every step the app takes from an accepted day (a
 * week's search margin, two years back for a ranking period, the end of a day) still lands on a key.
 * The Kennel Club's empty date, 0001-01-01, is no day.
 */
const SPELLED_YEARS = { first: 1000, last: 9999 }
const ACCEPTED_YEARS = { first: 1100, last: 9899 }

const isYearIn = (year: number, years: { first: number; last: number }) =>
  Number.isInteger(year) && year >= years.first && year <= years.last

const DAY_KEY_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/

/** Whether a year, month and day name a day that exists: no 30.2., no 31.4. */
const dayExists = (year: number, month: number, day: number) => {
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

/** Whether `value` is a `yyyy-MM-dd` that names a day there is, in the given years. */
const isKeyIn = (value: unknown, years: { first: number; last: number }): value is DayKey => {
  if (typeof value !== 'string' || !DAY_KEY_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  return isYearIn(year, years) && dayExists(year, month, day)
}

/** Whether `value` is a `yyyy-MM-dd` that names a day there is, in the accepted years. */
export const isDayKey = (value: unknown): value is DayKey => isKeyIn(value, ACCEPTED_YEARS)

/** A time with an explicit zone, `Z` or `±hh:mm`: without one a stamp is a wall-clock time, not an instant. */
const TIME_WITH_ZONE_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

/**
 * Whether `value` is an ISO instant: a day key, a `T` and a time with an explicit zone. A day the month
 * does not have (`2026-02-30T...`) is none, and neither is a zone-less stamp, which reads differently
 * on every host (`localStampToInstant` reads one in a named zone).
 */
export const isInstantString = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const [date, time, ...rest] = value.split('T')
  return rest.length === 0 && isDayKey(date) && time !== undefined && TIME_WITH_ZONE_RE.test(time)
}

/** Whether the parts spell a key: whole numbers, a four-digit year, a day the month has. */
const isDayParts = (year: number, month: number, day: number) =>
  isYearIn(year, SPELLED_YEARS) && Number.isInteger(month) && Number.isInteger(day) && dayExists(year, month, day)

const pad = (part: number) => String(part).padStart(2, '0')

/**
 * The key of the day `year`-`month`-`day`, with `month` 1 to 12. A day there is not (30.2.2026, a
 * fractional day, a year of fewer than four digits) is a programming error and throws.
 */
export const toDayKey = (year: number, month: number, day: number): DayKey => {
  if (!isDayParts(year, month, day)) throw new RangeError(`Not a day: ${year}-${month}-${day}`)
  const key = `${year}-${pad(month)}-${pad(day)}`
  // Narrows the template string to the DayKey type; the parts were checked above, so this never throws.
  if (!isKeyIn(key, SPELLED_YEARS)) throw new RangeError(`Not a day: ${key}`)
  return key
}

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

/**
 * Whole calendar months from `from` to `to`: the largest count whose `addMonths` step from `from`
 * does not pass `to`. A month is reached on the day of the month it started on, or on the last day of
 * a month that has no such day: from 28.12. nine months are reached on 28.9., from 31.7. on 30.4.,
 * from 31.1. one month on 28.2., or on 29.2. in a leap year. A `to` before `from` gives a negative
 * count, so a day after `to` is never any number of months before it.
 */
export const monthsBetween = (from: DayKey, to: DayKey): number => {
  const start = dayParts(from)
  const end = dayParts(to)
  const months = (end.year - start.year) * 12 + (end.month - start.month)
  return addMonths(from, months) > to ? months - 1 : months
}

/**
 * The latest day from which `months` whole months (`monthsBetween`) have passed by `day`. On the last
 * day of a month that is the last day of the month `months` earlier: by 30.4. nine months have passed
 * from 31.7. as well as from 30.7.
 */
export const latestDayMonthsBefore = (day: DayKey, months: number): DayKey => {
  const back = addMonths(day, -months)
  if (addDays(day, 1).endsWith('-01')) {
    const { year, month } = dayParts(back)
    return addDays(addMonths(toDayKey(year, month, 1), 1), -1)
  }
  return back
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

/** The instant on the clock of `zone`, or undefined for an invalid one. */
const inZone = (instant: Date | number, zone: string): TZDate | undefined => {
  const zoned = new TZDate(Number(instant), zone)
  return Number.isNaN(zoned.getTime()) ? undefined : zoned
}

/**
 * Whether the instant has a day in the accepted years in `zone`. Check this before `dayOf` on anything
 * stored or received: the Kennel Club's empty date (0001-01-01) is a valid Date but no calendar day.
 */
export const hasCalendarDay = (instant: Date | number, zone: string): boolean => {
  const zoned = inZone(instant, zone)
  return zoned !== undefined && isYearIn(zoned.getFullYear(), ACCEPTED_YEARS)
}

/**
 * The day the instant falls on in `zone`. An invalid instant, or one outside the years a key can spell
 * (1000 to 9999), throws; a caller that holds a value from storage or a request checks it first with
 * `hasCalendarDay`, whose accepted years are a century inside those.
 */
export const dayOf = (instant: Date | number, zone: string): DayKey => {
  const zoned = inZone(instant, zone)
  if (!zoned) throw new RangeError('Not an instant')
  return toDayKey(zoned.getFullYear(), zoned.getMonth() + 1, zoned.getDate())
}

/**
 * The first moment of the day in `zone`, as a plain Date (the stored form is the UTC instant; copying
 * the TZDate drops its class). Built through the zone's own clock, so where a change of time falls on
 * midnight the day starts at the first moment the zone has.
 */
export const dayStart = (day: DayKey, zone: string): Date => {
  const { year, month, day: date } = dayParts(day)
  return new Date(new TZDate(year, month - 1, date, zone))
}

/**
 * The last millisecond of the day in `zone`: a day of 23 or 25 hours ends where the next one starts.
 * The next day is built on the zone's clock, not as a key, so the last day a key can spell has an end.
 */
export const dayEnd = (day: DayKey, zone: string): Date => {
  const { year, month, day: date } = dayParts(day)
  return new Date(new TZDate(year, month - 1, date + 1, zone).getTime() - 1)
}

/**
 * A stamp written without a zone (`2026-06-28T00:00:00`, or a bare day) as the wall-clock time it is in
 * `zone`; a stamp that carries a zone keeps it. A plain Date: copying the parse's TZDate drops its class.
 *
 * One limit: a wall-clock time the zone has twice (03:xx on the autumn change in Finland) is resolved by
 * date-fns through the host's zone, so the hour, never the day, can differ between machines there.
 * Kennelliitto's stamps are midnights, which no change of time repeats.
 */
export const localStampToInstant = (stamp: string, zone: string): Date => new Date(parseISO(stamp, { in: tz(zone) }))

/** The first moment, in `zone`, of the day the instant falls on there, or of the day `days` days from it. */
export const dayStartOf = (instant: Date | number, zone: string, days = 0): Date =>
  dayStart(addDays(dayOf(instant, zone), days), zone)

/** The last millisecond, in `zone`, of the day the instant falls on there. */
export const dayEndOf = (instant: Date | number, zone: string): Date => dayEnd(dayOf(instant, zone), zone)

/** Whether the two instants fall on the same day in `zone`. */
export const sameDay = (a: Date | number, b: Date | number, zone: string): boolean => dayOf(a, zone) === dayOf(b, zone)

/** The year the instant falls in, in `zone`. */
export const yearOf = (instant: Date | number, zone: string): number => dayParts(dayOf(instant, zone)).year

/** The first moment of the year in `zone`. */
export const yearStart = (year: number, zone: string): Date => dayStart(toDayKey(year, 1, 1), zone)

/** The last millisecond of the year in `zone`. */
export const yearEnd = (year: number, zone: string): Date => dayEnd(toDayKey(year, 12, 31), zone)

/** The year it is now in `zone`: the stats pages' default year. */
export const currentYear = (zone: string): number => yearOf(new Date(), zone)

/** The month of a day as `yyyy-MM`: the key the statistics bucket by. */
export const monthKeyOf = (day: DayKey): string => day.slice(0, 7)

/**
 * The instant moved by whole calendar days of `zone`, keeping its wall-clock time there: midnight
 * stays midnight and 23:59:59.999 stays so across a change of time, where 24-hour steps would land
 * an hour off. For a day that is known to start or end the result, prefer `dayStart`/`dayEnd` of
 * `addDays`; this is for stored instants whose time of day is to be kept as it is.
 *
 * One limit: a wall-clock time that the target day has twice (03:xx on the autumn change) is
 * resolved by date-fns through the host's zone, so the hour, never the day, can differ between
 * machines there. Stored instants are midnights or 23:59:59.999, which no change of time repeats.
 */
export const shiftDays = (instant: Date, days: number, zone: string): Date =>
  new Date(addDaysInZone(instant, days, { in: tz(zone) }))

/*
 * The browser's day. MUI's date pickers (AdapterDateFns) read and write a Date in the browser's zone
 * and have no zone of their own, so the day a picker shows is the Date's local year, month and date.
 * These are the one place that reads or builds such a Date: the pickers turn their values into day
 * keys and back through them (KOE-1548), and what a browser stored before that, a picker's local
 * midnight, is read back the same way (`localCalendarDayOf`).
 */

/**
 * Whether the Date names a day in the browser's zone that a key can spell: a valid Date in the years
 * 1000 to 9999 there. A half-typed picker value is an Invalid Date, a typed year 202 is year 202,
 * and Kennelliitto's empty date reads as year 1; none of them has a day. Check this before `localDayOf`.
 */
export const hasLocalDay = (date: Date): boolean =>
  !Number.isNaN(date.getTime()) && isYearIn(date.getFullYear(), SPELLED_YEARS)

/** The day the Date shows in the browser's zone: the day a picker shows for it. Throws without `hasLocalDay`. */
export const localDayOf = (date: Date): DayKey => toDayKey(date.getFullYear(), date.getMonth() + 1, date.getDate())

/** The browser's midnight that starts the day: the value a picker shows as that day. */
export const localDateOf = (day: DayKey): Date => {
  const { year, month, day: date } = dayParts(day)
  return new Date(year, month - 1, date)
}

/**
 * The day a picker's Date shows, or undefined for one that is no day a key can hold: a half-typed
 * value (an Invalid Date), or a year outside the accepted ones.
 */
export const pickedDayOf = (date: Date): DayKey | undefined => {
  if (!hasLocalDay(date)) return undefined
  const day = localDayOf(date)
  return isDayKey(day) ? day : undefined
}

/*
 * A dog's birth date and a result's date are calendar days, stored in the forms they have had
 * (KOE-1548): a key, Kennelliitto's stamp without a zone (`2021-01-01T00:00:00`), or an instant a
 * browser or a lambda wrote (`2020-12-31T22:00:00.000Z`). These two read any of them as a day.
 */

/** A time of day without a zone: the time part of Kennelliitto's stamps. */
const ZONELESS_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/

/** Whether `value` names a day without a zone: a key, or a key, a `T` and a time with no zone. */
const isZonelessDay = (value: string) => {
  const [date, time, ...rest] = value.split('T')
  return rest.length === 0 && DAY_KEY_RE.test(date) && (time === undefined || ZONELESS_TIME_RE.test(time))
}

const storedDay = (value: string, instantDay: (instant: Date) => DayKey | undefined): DayKey | undefined => {
  if (isZonelessDay(value)) {
    const day = value.slice(0, 10)
    return isDayKey(day) ? day : undefined
  }
  return isInstantString(value) ? instantDay(new Date(value)) : undefined
}

/**
 * The day of a stored dog date: the day written on a key or a zone-less stamp, and the day an instant
 * falls on in `zone`. Undefined for anything with no day there, Kennelliitto's empty 0001-01-01 in
 * every form included: never a throw, since a list reads every row.
 */
export const calendarDayOf = (value: string, zone: string): DayKey | undefined =>
  storedDay(value, (instant) => (hasCalendarDay(instant, zone) ? dayOf(instant, zone) : undefined))

/**
 * As `calendarDayOf`, but an instant is read as the day it shows in the browser's zone: for what this
 * browser itself stored, a picker's local midnight (a draft, the dog cache), which is the day it showed.
 */
export const localCalendarDayOf = (value: string): DayKey | undefined => storedDay(value, pickedDayOf)
