import type { TFunction } from 'i18next'
import type { BreedCode, DayKey, DeepPartial, Dog, DogGender } from '../types'
import { differenceInMinutes } from 'date-fns/differenceInMinutes'
import { REQUIREMENTS } from '../rules'
import { addMonths, isDayKey, latestDayMonthsBefore, monthsBetween } from './day'

/** A result cannot predate the dog being this many months old, whatever the trial it is entered in. */
export const MIN_RESULT_AGE_MONTHS = 9

/** The age in whole months a dog must have reached on the first day of a trial of the type; 0 for none. */
export const minDogAgeFor = (eventType: string): number => {
  const requirements = REQUIREMENTS[eventType]
  return requirements && 'age' in requirements ? (requirements.age ?? 0) : 0
}

/*
 * The dog's birth date is a day key (KOE-1548), the day Kennelliitto wrote or the dob picker showed.
 * The trial's day is a day key too (KOE-1547).
 */

/** The dog's age in whole months (`monthsBetween`) on the day the trial starts. */
export const dogAgeInMonths = (dob: DayKey, eventStart: DayKey): number => monthsBetween(dob, eventStart)

/** The latest birth day of a dog that is `months` old on the trial's first day. */
export const latestDobForAge = (eventStart: DayKey, months: number): DayKey => latestDayMonthsBefore(eventStart, months)

/** Kennelliitto takes a microchip of exactly this form: 15 digits, nothing else (KOE-1201). */
const RE_MICROCHIP = /^\d{15}$/

/** Whether a microchip number is one Kennelliitto takes; anything but a string is not (KOE-1650). */
export const isMicrochip = (value: unknown): boolean => typeof value === 'string' && RE_MICROCHIP.test(value)

/**
 * A typed microchip number without the spaces, tabs and invisible characters a copy brings with it:
 * a vet's paper groups the digits ("985 120 012 345 678"), and a paste may carry a zero-width space
 * (KOE-1650).
 */
export const normalizeMicrochip = (value: string): string => value.replaceAll(/[\s\p{Cf}]/gu, '')

/** Which of the dog's details are the user's to type, rather than Kennelliitto's to give. */
interface TypedDogFields {
  /** The sex, the birth date and the breed. */
  details: boolean
  rfid: boolean
}

/**
 * Which of the dog's details the user types, the one rule the registration form opens its fields by
 * and judges them by (KOE-1650). A dog GetDog read from Kennelliitto carries the `refreshDate` it
 * stamps (since 2022); one entered by hand has none, and all of these are the user's. Of a
 * Kennelliitto dog only a chip it has none for is (`rfidEditable`). A row stored before 2022 has no
 * `refreshDate` either and counts as entered by hand.
 */
export const typedDogFields = (dog?: { refreshDate?: unknown; rfidEditable?: boolean } | null): TypedDogFields => {
  const byHand = !dog?.refreshDate
  return { details: byHand, rfid: byHand || Boolean(dog?.rfidEditable) }
}

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
