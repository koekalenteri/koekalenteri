import type { TFunction } from 'i18next'
import type { BreedCode, DayKey, DeepPartial, Dog, DogGender } from '../types'
import { differenceInMinutes } from 'date-fns/differenceInMinutes'
import { dayOf, hasCalendarDay, isDayKey, TIME_ZONE } from './day'

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

/**
 * The day an official result was written on. Kennelliitto's `aika` has no zone, and both the browser's
 * typed boundary and the lambda's `new Date` read it as local time, so the local getters give back the
 * day written on it in any host zone; read in Finnish time, it would move a day back east of Finland.
 * Undefined for a date that has no day: an invalid one, or the Kennel Club's empty 0001-01-01. The
 * results move to day keys in KOE-1547 and KOE-1548, and this reader with them.
 */
export const officialResultDay = (date: Date): DayKey | undefined => {
  if (Number.isNaN(date.getTime())) return undefined
  const pad = (part: number) => String(part).padStart(2, '0')
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return isDayKey(key) ? key : undefined
}

/**
 * The day a hand-entered result counts for: its Finnish day. The form sends the picked date as an
 * instant (`toISOString`), so the browser and the lambda agree only when both read it in one zone.
 * Undefined for a date that has no day.
 */
export const manualResultDay = (date: Date): DayKey | undefined =>
  hasCalendarDay(date, TIME_ZONE) ? dayOf(date, TIME_ZONE) : undefined

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
