import type { JsonDbRecord, JsonUser } from '../../types'
import {
  compareUsersForCanonical,
  pickCanonicalUser,
  pickCanonicalUserPreferLinked,
  preferCanonical,
} from './userCanonical'

const defaults: Omit<JsonDbRecord, 'id'> = {
  createdAt: '2020-11-12T11:11:11.000Z',
  createdBy: 'system',
  modifiedAt: '2020-11-12T11:11:11.000Z',
  modifiedBy: 'system',
}

describe('lib/userCanonical', () => {
  it('compareUsersForCanonical prefers higher score, then newer modifiedAt', () => {
    const a: JsonUser = { ...defaults, email: 'a@example.com', id: 'a', name: 'A' }
    const b: JsonUser = { ...defaults, email: 'b@example.com', id: 'b', name: 'B', roles: { org: 'admin' } }
    expect(compareUsersForCanonical(a, b)).toBeGreaterThan(0)

    const older: JsonUser = {
      ...defaults,
      email: 'o@example.com',
      id: 'o',
      modifiedAt: '2020-01-01T00:00:00.000Z',
      name: 'Old',
    }
    const newer: JsonUser = {
      ...defaults,
      email: 'n@example.com',
      id: 'n',
      modifiedAt: '2021-01-01T00:00:00.000Z',
      name: 'New',
    }
    expect(compareUsersForCanonical(older, newer)).toBeGreaterThan(0)
  })

  it('pickCanonicalUserPreferLinked and wrappers choose expected user', () => {
    const base: JsonUser = { ...defaults, email: 'u1@example.com', id: 'u1', name: 'u1' }
    const rich: JsonUser = { ...defaults, email: 'u2@example.com', id: 'u2', name: 'u2', roles: { org: 'admin' } }

    expect(pickCanonicalUserPreferLinked([base, rich], new Set(['u1'])).id).toBe('u1')
    expect(pickCanonicalUser([base, rich]).id).toBe('u2')
    expect(preferCanonical(base, rich).id).toBe('u2')
  })
})
