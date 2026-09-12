import { auditUser } from './audit'

describe('auditUser', () => {
  it('names an authenticated user without a source', () => {
    expect(auditUser({ name: 'Test User' })).toEqual({ user: 'Test User' })
  })

  it('carries the source of a name taken from the registration', () => {
    expect(auditUser({ name: 'Payer Name', source: 'registration' })).toEqual({
      user: 'Payer Name',
      userSource: 'registration',
    })
  })
})
