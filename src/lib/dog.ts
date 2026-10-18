import type { TFunction } from 'i18next'
import type { BreedCode, DeepPartial, Dog, DogGender } from '../types'
import { differenceInMinutes } from 'date-fns/differenceInMinutes'
import { REQUIREMENTS } from '../rules'
import {
  addMonths,
  dayOf,
  hasCalendarDay,
  hasLocalDay,
  latestDayMonthsBefore,
  localDateOf,
  localDayOf,
  monthsBetween,
  TIME_ZONE,
} from './day'

/** A result cannot predate the dog being this many months old, whatever the trial it is entered in. */
export const MIN_RESULT_AGE_MONTHS = 9

/** The age in whole months a dog must have reached on the first day of a trial of the type; 0 for none. */
export const minDogAgeFor = (eventType: string): number => {
  const requirements = REQUIREMENTS[eventType]
  return requirements && 'age' in requirements ? (requirements.age ?? 0) : 0
}

/*
 * The dog's birth date is a browser-zone Date until it is stored as a day (KOE-1547): Kennelliitto's
 * zone-less stamp read as a local midnight, or the day the dob picker wrote. Its day is the one the
 * picker shows (`localDayOf`), never its Finnish day: in Tokyo the Finnish day of a 1.1. midnight is
 * 31.12. The trial's day is its Finnish day.
 */

/**
 * The dog's age in whole months (`monthsBetween`) on the Finnish day the trial starts, or undefined for
 * a birth date with no day (Kennelliitto's empty date, a half-typed or out-of-range picker value).
 */
export const dogAgeInMonths = (dob: Date, eventStart: Date): number | undefined =>
  hasLocalDay(dob) ? monthsBetween(localDayOf(dob), dayOf(eventStart, TIME_ZONE)) : undefined

/** The latest birth date, as the dob picker's Date, of a dog that is `months` old on the trial's first day. */
export const latestDobForAge = (eventStart: Date, months: number): Date =>
  localDateOf(latestDayMonthsBefore(dayOf(eventStart, TIME_ZONE), months))

/** The earliest date, as a picker's Date, a result of the dog can have; undefined for a birth date with no day. */
export const earliestResultDate = (dob: Date): Date | undefined =>
  hasLocalDay(dob) ? localDateOf(addMonths(localDayOf(dob), MIN_RESULT_AGE_MONTHS)) : undefined

/**
 * Determines if a dog's data should be allowed to be refreshed
 * @param dog The dog data
 * @returns True if refresh should be allowed, false otherwise
 */
export function shouldAllowRefresh(dog?: DeepPartial<Dog>): boolean {
  if (!dog?.regNo) {
    return false
  }
  if (dog.refreshDate && differenceInMinutes(new Date(), dog.refreshDate) <= 5) {
    return false
  }
  return !!dog.refreshDate
}

/**
 * Determines if a dog has a valid date of birth
 * KL returns "0001-01-01T00:00:00" for dogs with missing dob
 * @param dob The date of birth
 * @returns True if dob is valid, false otherwise
 */
export function isValidDob(dob?: Date): boolean {
  if (!dob) {
    return false
  }
  // The KL empty value (0001-01-01) has no calendar day, in any zone the browser is in.
  return hasCalendarDay(dob, TIME_ZONE)
}

/** How many leading characters of a breed name to use when the breed has no official abbreviation. */
const DERIVED_BREED_ABBREVIATION_LENGTH = 3

/**
 * Short breed marker for start lists and other dense listings.
 *
 * The breedAbbr resource holds two kinds of official abbreviation: the retriever ones, which vary
 * by sex ("lbu"/"lbn"), are objects keyed by gender, and SPKL's service dog ones, which do not,
 * are plain strings. Unofficial events accept any breed, so for everything else (spaniels,
 * pointers, ...) we derive a marker from the start of the breed name, which is unique enough in
 * practice and at least readable, unlike the bare breed code.
 */
export function breedAbbreviation(t: TFunction, breedCode?: BreedCode, gender?: DogGender): string {
  if (!breedCode) return ''

  if (gender) {
    const sexed: string = t(`${breedCode}.${gender}`, { defaultValue: '', ns: 'breedAbbr' })
    if (sexed) return sexed
  }

  // returnObjects keeps the sex-specific entries from resolving to i18next's "returned an object" notice
  const shared = t(breedCode, { defaultValue: '', ns: 'breedAbbr', returnObjects: true })
  if (typeof shared === 'string' && shared) return shared

  const name: string = t(breedCode, { defaultValue: '', ns: 'breed' })
  return name ? name.slice(0, DERIVED_BREED_ABBREVIATION_LENGTH).toLowerCase() : breedCode
}

export function formatDogName(dog?: Pick<Dog, 'name' | 'titles'>): string {
  return [dog?.titles, dog?.name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * Creates a dog update object from form values
 * @param values Form values
 * @returns Dog update object
 */
export function createDogUpdateFromFormValues(values: {
  rfid: string
  name: string
  titles: string
  dob: Date | undefined
  gender: DogGender | ''
  breedCode: BreedCode | ''
  sire: string
  dam: string
}): DeepPartial<Dog> {
  const { rfid, name, titles, dob, gender, breedCode, sire, dam } = values

  return {
    breedCode: breedCode || undefined,
    dam: { name: dam },
    dob,
    gender: gender || undefined,
    name,
    rfid,
    sire: { name: sire },
    titles,
  }
}
