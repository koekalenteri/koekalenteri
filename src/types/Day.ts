declare const dayKeyBrand: unique symbol

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

/**
 * A calendar day with no zone, as `yyyy-MM-dd`: the day a trial runs, an entry opens or closes, a
 * dog is placed on. It is not a moment; the moments a day starts and ends depend on the zone, and
 * only `src/lib/day.ts` turns one into the other (KOE-1545).
 *
 * The type takes a literal of the right shape (`'2026-10-17'`, a `RuleDate`) and refuses a plain
 * `string`, an instant and a key with an unpadded month, so a value typed `DayKey` compares and sorts
 * as text. `isDayKey` narrows what comes in from storage or a URL; `toDayKey` builds one from parts.
 */
export type DayKey = `${number}-${'0' | '1'}${Digit}-${'0' | '1' | '2' | '3'}${Digit}` & {
  readonly [dayKeyBrand]?: never
}

/**
 * Four digits from 1000 on: the calendar has no day before that, and the Date constructors would read
 * a year below 100 as 19xx. The Kennel Club's empty date, 0001-01-01, is therefore not a day.
 */
const DAY_KEY_RE = /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/

/** Whether a year, month and day name a day that exists: no 30.2., no 31.4. */
const dayExists = (year: number, month: number, day: number) => {
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

/** Whether `value` is a `yyyy-MM-dd` that names a day there is. */
export const isDayKey = (value: unknown): value is DayKey => {
  if (typeof value !== 'string' || !DAY_KEY_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  return dayExists(year, month, day)
}

const pad = (part: number) => String(part).padStart(2, '0')

/**
 * The key of the day `year`-`month`-`day`, with `month` 1 to 12. A day there is not (30.2.2026, a
 * fractional day, a year of fewer than four digits) is a programming error and throws.
 */
export const toDayKey = (year: number, month: number, day: number): DayKey => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1000 ||
    year > 9999 ||
    !dayExists(year, month, day)
  ) {
    throw new RangeError(`Not a day: ${year}-${month}-${day}`)
  }
  const key = `${year}-${pad(month)}-${pad(day)}`
  if (!isDayKey(key)) throw new RangeError(`Not a day: ${key}`)
  return key
}
