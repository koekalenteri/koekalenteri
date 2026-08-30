import type { TFunction } from 'i18next'
import type { BreedCode, DeepPartial, Dog, DogGender } from '../types'
import { differenceInMinutes } from 'date-fns'

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
  // Check if the date is the KL empty value (0001-01-01)
  return dob.getFullYear() > 1
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
