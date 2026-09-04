import type { Person } from '../../../types'
import { hasEmailError, hasPhoneError, validateOwner, validateOwnerContact, validatePerson } from './personValidation'

const testPerson: Person = {
  email: 'email@domain.com',
  location: 'Helsinki',
  name: 'Matti Meikäläinen',
  phone: '0401234567',
}

describe('validatePerson', () => {
  it('requires name', () => {
    expect(validatePerson({ ...testPerson, name: '' })).toEqual('required')
  })

  it('requires and validates email', () => {
    expect(validatePerson({ ...testPerson, email: '' })).toEqual('required')
    expect(validatePerson({ ...testPerson, email: '-@a' })).toEqual('email')
  })

  it('requires phone', () => {
    expect(validatePerson({ ...testPerson, phone: '' })).toEqual('required')
  })

  it('requires location', () => {
    expect(validatePerson({ ...testPerson, location: '' })).toEqual('required')
  })
})

/** The shared fixture's phone has no country code, which `matchIsValidTel` rejects. */
const reachablePerson: Person = { ...testPerson, phone: '+35840123456' }

describe('validateOwnerContact', () => {
  it('requires a name and nothing else', () => {
    expect(validateOwnerContact({ email: '', name: 'Matti Meikäläinen' })).toBe(false)
    expect(validateOwnerContact({ email: '', name: '' })).toEqual('required')
    expect(validateOwnerContact(undefined)).toEqual('required')
  })

  it('validates contact details that were given anyway', () => {
    expect(validateOwnerContact({ ...reachablePerson, email: '-@a' })).toEqual('emailOptional')
    expect(validateOwnerContact({ ...reachablePerson, phone: '040' })).toEqual('phoneOptional')
    expect(validateOwnerContact(reachablePerson)).toBe(false)
  })

  it('reads a bare calling code as no phone number at all', () => {
    // MuiTelInput keeps "+358" in the field after the number is deleted; that must not read as an
    // invalid number, or an optional field could not be emptied again.
    expect(validateOwnerContact({ ...reachablePerson, phone: '+358' })).toBe(false)
    expect(validateOwnerContact({ ...reachablePerson, phone: '+358 ' })).toBe(false)
    expect(validateOwnerContact({ ...reachablePerson, phone: '+3584' })).toEqual('phoneOptional')
  })
})

describe('validateOwner', () => {
  const namedOnly: Person = { email: '', name: 'Matti Meikäläinen' }

  it('asks the handling owner for everything', () => {
    expect(validateOwner(namedOnly, 'handles')).toEqual('required')
    expect(validateOwner(reachablePerson, 'handles')).toBe(false)
  })

  it('asks the paying owner for everything but a hometown', () => {
    expect(validateOwner(namedOnly, 'pays')).toEqual('required')
    expect(validateOwner({ ...reachablePerson, location: '' }, 'pays')).toBe(false)
  })

  it('asks a co-owner for a name only', () => {
    expect(validateOwner(namedOnly, 'none')).toBe(false)
  })
})

describe('hasEmailError', () => {
  it('flags a missing address only when it is required', () => {
    expect(hasEmailError('', true)).toBe(true)
    expect(hasEmailError(undefined, true)).toBe(true)
    expect(hasEmailError('', false)).toBe(false)
  })

  it('flags an address that does not validate, required or not', () => {
    expect(hasEmailError('not-an-address', false)).toBe(true)
    expect(hasEmailError('email@domain.com', false)).toBe(false)
  })
})

describe('hasPhoneError', () => {
  it('flags a missing number only when it is required', () => {
    expect(hasPhoneError('', true)).toBe(true)
    expect(hasPhoneError('+358', true)).toBe(true)
    expect(hasPhoneError('+358', false)).toBe(false)
    expect(hasPhoneError(undefined, false)).toBe(false)
  })

  it('flags a number that does not validate, required or not', () => {
    expect(hasPhoneError('+35841234', false)).toBe(true)
    expect(hasPhoneError('040 123 4567', false)).toBe(true)
    expect(hasPhoneError('+35840123456', false)).toBe(false)
  })
})
