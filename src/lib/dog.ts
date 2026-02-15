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
    rfid,
    name,
    titles,
    dob,
    gender: gender || undefined,
    breedCode: breedCode || undefined,
    sire: { name: sire },
    dam: { name: dam },
  }
}
