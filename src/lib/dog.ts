import type { TFunction } from 'i18next'
import type { BreedCode, DayKey, DeepPartial, Dog, DogGender } from '../types'
import { differenceInMinutes } from 'date-fns/differenceInMinutes'
import { REQUIREMENTS } from '../rules'
import { addMonths, dayOf, isDayKey, latestDayMonthsBefore, monthsBetween, TIME_ZONE } from './day'

/** A result cannot predate the dog being this many months old, whatever the trial it is entered in. */
export const MIN_RESULT_AGE_MONTHS = 9

/** The age in whole months a dog must have reached on the first day of a trial of the type; 0 for none. */
export const minDogAgeFor = (eventType: string): number => {
  const requirements = REQUIREMENTS[eventType]
  return requirements && 'age' in requirements ? (requirements.age ?? 0) : 0
}

/*
 * The dog's birth date is a day key (KOE-1548), the day Kennelliitto wrote or the dob picker showed.
 * The trial's day is its Finnish day.
 */

/** The dog's age in whole months (`monthsBetween`) on the Finnish day the trial starts. */
export const dogAgeInMonths = (dob: DayKey, eventStart: Date): number =>
  monthsBetween(dob, dayOf(eventStart, TIME_ZONE))

/** The latest birth day of a dog that is `months` old on the trial's first day. */
export const latestDobForAge = (eventStart: Date, months: number): DayKey =>
  latestDayMonthsBefore(dayOf(eventStart, TIME_ZONE), months)

/** The earliest day a result of the dog can have. */
export const earliestResultDay = (dob: DayKey): DayKey => addMonths(dob, MIN_RESULT_AGE_MONTHS)

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
 * Whether the dog has a birth day. Kennelliitto's empty date (0001-01-01) is read as none at the
 * typed boundary, so this is whether there is a key.
 */
export const isValidDob = (dob?: DayKey): dob is DayKey => isDayKey(dob)

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

/** Kennelliitto's empty date in the forms it was stored in: its own stamp, and the instants written of it. */
const KC_EMPTY_DATE_RE = /^(?:0001-01-01|0000-12-31)(?:T|$)/

/** Whether a stored dog date says there is no day: none, an empty one, or Kennelliitto's empty date. */
export const isNoDay = (value: string | undefined) => !value || KC_EMPTY_DATE_RE.test(value)

/**
 * Creates a dog update object from form values
 * @param values Form values
 * @returns Dog update object
 */
export function createDogUpdateFromFormValues(values: {
  rfid: string
  name: string
  titles: string
  dob: DayKey | undefined
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
