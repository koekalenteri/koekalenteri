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
    const a: JsonUser = { ...defaults, id: 'a', name: 'A', email: 'a@example.com' }
    const b: JsonUser = { ...defaults, id: 'b', name: 'B', email: 'b@example.com', roles: { org: 'admin' } }
    expect(compareUsersForCanonical(a, b)).toBeGreaterThan(0)

    const older: JsonUser = {
      ...defaults,
      id: 'o',
      name: 'Old',
      email: 'o@example.com',
      modifiedAt: '2020-01-01T00:00:00.000Z',
    }
    const newer: JsonUser = {
      ...defaults,
      id: 'n',
      name: 'New',
      email: 'n@example.com',
      modifiedAt: '2021-01-01T00:00:00.000Z',
    }
    expect(compareUsersForCanonical(older, newer)).toBeGreaterThan(0)
  })

  it('pickCanonicalUserPreferLinked and wrappers choose expected user', () => {
    const base: JsonUser = { ...defaults, id: 'u1', name: 'u1', email: 'u1@example.com' }
    const rich: JsonUser = { ...defaults, id: 'u2', name: 'u2', email: 'u2@example.com', roles: { org: 'admin' } }

    expect(pickCanonicalUserPreferLinked([base, rich], new Set(['u1'])).id).toBe('u1')
    expect(pickCanonicalUser([base, rich]).id).toBe('u2')
    expect(preferCanonical(base, rich).id).toBe('u2')
  })
})
