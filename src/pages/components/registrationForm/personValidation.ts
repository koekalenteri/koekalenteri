import type { OwnerRole } from '../../../lib/registration'
import type { Person } from '../../../types'
import { matchIsValidTel } from 'mui-tel-input'
import { validEmail } from '../../../lib/email'

/** MuiTelInput keeps the calling code in the field, so a bare "+358" means no number was given. */
const isBlankPhone = (phone: string | undefined): boolean => !phone?.trim() || /^\+\d{1,3}$/.test(phone.trim())

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

/**
 * A co-owner who neither handles nor pays only has to be named (KOE-1351). Contact details stay
 * optional there, but anything volunteered must still be usable — a co-owner's email is one of the
 * addresses the registration mail is sent to.
 */
export function validateOwnerContact(person: Person | undefined) {
  if (!person?.name) return 'required'
  if (person.email && !validEmail(person.email)) return 'email'
  if (!isBlankPhone(person.phone) && !matchIsValidTel(person.phone ?? '')) return 'phone'

  return false
}

/** Validates an owner by the role they were given: see {@link OwnerRole}. */
export function validateOwner(person: Person | undefined, role: OwnerRole) {
  if (role === 'handles') return validatePerson(person)
  if (role === 'pays') return validatePerson(person, false)
  return validateOwnerContact(person)
}
