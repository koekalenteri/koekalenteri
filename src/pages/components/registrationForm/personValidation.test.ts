import type { Person } from '../../../types'
import { validateOwner, validateOwnerContact, validatePerson } from './personValidation'

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
    expect(validateOwnerContact({ ...reachablePerson, email: '-@a' })).toEqual('email')
    expect(validateOwnerContact({ ...reachablePerson, phone: '040' })).toEqual('phone')
    expect(validateOwnerContact(reachablePerson)).toBe(false)
  })

  it('reads a bare calling code as no phone number at all', () => {
    // MuiTelInput keeps "+358" in the field after the number is deleted; that must not read as an
    // invalid number, or an optional field could not be emptied again.
    expect(validateOwnerContact({ ...reachablePerson, phone: '+358' })).toBe(false)
    expect(validateOwnerContact({ ...reachablePerson, phone: '+358 ' })).toBe(false)
    expect(validateOwnerContact({ ...reachablePerson, phone: '+3584' })).toEqual('phone')
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
