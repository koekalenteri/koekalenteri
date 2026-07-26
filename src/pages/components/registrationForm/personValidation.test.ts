import type { Person } from '../../../types'
import { validatePerson } from './personValidation'

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
