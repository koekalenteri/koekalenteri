import type { User } from '../types'
import { scoreUser, userHasAdminAccess } from './user'

describe('lib/user', () => {
  describe('userHasAdminAccess', () => {
    it('denies access when the user is missing or has no administrative privileges', () => {
      expect(userHasAdminAccess()).toBe(false)
      expect(userHasAdminAccess(null)).toBe(false)
      expect(userHasAdminAccess({})).toBe(false)
      expect(userHasAdminAccess({ admin: false, roles: {} })).toBe(false)
    })

    it('grants access to a system administrator', () => {
      expect(userHasAdminAccess({ admin: true })).toBe(true)
    })

    it('grants access to a user with an organizer role', () => {
      expect(userHasAdminAccess({ roles: { org1: 'secretary' } })).toBe(true)
    })
  })

  describe('scoreUser', () => {
    it.each([
      ['no privileges', { id: 'u1' }, 0],
      ['admin access', { admin: true, id: 'u1' }, 1000],
      ['organizer roles', { id: 'u1', roles: { org1: 'admin', org2: 'secretary' } }, 20],
      ['officer qualifications', { id: 'u1', officer: ['NOME-A', 'NOME-B'] }, 2],
      ['judge qualifications', { id: 'u1', judge: ['NOME-A'] }, 1],
    ])('scores %s', (_description, user, expected) => {
      expect(scoreUser(user)).toBe(expected)
    })

    it('adds the linked-user bonus only when the user is linked', () => {
      const user = { id: 'u1' }

      expect(scoreUser(user, new Set(['u1']))).toBe(2000)
      expect(scoreUser(user, new Set(['u2']))).toBe(0)
      expect(scoreUser(user)).toBe(0)
    })

    it('combines all score components', () => {
      const user: User = {
        admin: true,
        email: 'u1@example.com',
        id: 'u1',
        judge: ['NOME-A'],
        name: 'U1',
        officer: ['NOME-A', 'NOME-B'],
        roles: { org1: 'admin', org2: 'secretary' },
      }

      expect(scoreUser(user, new Set(['u1']))).toBe(3023)
    })
  })
})
