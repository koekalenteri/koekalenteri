import type { Person } from '../../../types'
import { matchIsValidTel } from 'mui-tel-input'
import { validEmail } from '../../../lib/email'

export function validatePerson(person: Person | undefined, location = true) {
  if (!person?.email || !person.name || !person.phone || (location && !person.location)) {
    return 'required'
  }
  if (!validEmail(person.email)) return 'email'
  if (!matchIsValidTel(person.phone)) {
    console.error('invalid phone: ', person.phone)
    return 'phone'
  }

  return false
}
