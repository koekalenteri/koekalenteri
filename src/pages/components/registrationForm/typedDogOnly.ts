import type { ParticipantFieldLocks } from '@/lib/registrationLocks'
import type { DeepPartial, Dog, Registration } from '@/types'
import { typedDogFields } from '@/lib/dog'

/**
 * A trial that is over: the secretary may still fix the details of the dog that were typed by hand,
 * the number among them, which the results send needs (KOE-1650, KOE-1674); every other section of the
 * form stays locked. Only the form reads this: the admin lambda does not enforce it.
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
 * types by `typedDogFields` (KOE-1650, KOE-1674). Everything else, the dog's other fields included, is
 * dropped, so opening a judged entry changes nothing and a fix changes only what was fixed.
 *
 * With `replace` the filtered dog would replace the whole dog. That path is unreachable after the
 * trial: only a lookup asks for a replace, `numberOnly` in DogInfo keeps a typed dog in mode 'update'
 * with its button off, and a Kennelliitto dog's field and button are locked.
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
    if (next.regNo !== undefined) fields.regNo = next.regNo
    if (next.gender !== undefined) fields.gender = next.gender
    if (next.dob !== undefined) fields.dob = next.dob
    if (next.breedCode !== undefined) fields.breedCode = next.breedCode
  }
  return Object.keys(fields).length ? { dog: fields } : {}
}
