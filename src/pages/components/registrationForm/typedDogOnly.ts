import type { ParticipantFieldLocks } from '@/lib/registrationLocks'
import type { DeepPartial, Dog, Registration } from '@/types'
import { typedDogFields } from '@/lib/dog'

/**
 * A trial that is over: the secretary may still fix the details of the dog that were typed by hand,
 * which the results send needs (KOE-1650); every other section of the form stays locked. Only the
 * form reads this: the admin lambda does not enforce it.
 */
export const TYPED_DOG_ONLY_LOCKS: ParticipantFieldLocks = {
  dog: false,
  entry: true,
  membership: true,
  payment: true,
  people: true,
  results: true,
}

/**
 * Of a change the form is handed, only what it may take after the trial: the dog's details the user
 * types by `typedDogFields` (KOE-1650). Everything else, the dog's other fields included, is dropped,
 * so opening a judged entry changes nothing and a fix changes only what was fixed.
 */
export const typedDogChange = (
  dog: Registration['dog'] | undefined,
  change: DeepPartial<Registration>
): DeepPartial<Registration> => {
  const typed = typedDogFields(dog)
  const next = change.dog
  if (!next) return {}
  const fields: DeepPartial<Dog> = {}
  if (typed.rfid && next.rfid !== undefined) fields.rfid = next.rfid
  if (typed.details) {
    if (next.gender !== undefined) fields.gender = next.gender
    if (next.dob !== undefined) fields.dob = next.dob
    if (next.breedCode !== undefined) fields.breedCode = next.breedCode
  }
  return Object.keys(fields).length ? { dog: fields } : {}
}
