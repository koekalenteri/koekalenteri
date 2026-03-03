import type { User } from '../types'
import { scoreUser } from './userCanonical'

describe('lib/userCanonical', () => {
  it('scoreUser includes link/admin/roles/officer/judge weights', () => {
    const u: User = {
      admin: true,
      email: 'u1@example.com',
      id: 'u1',
      judge: ['NOME-A'],
      name: 'U1',
      officer: ['NOME-A', 'NOME-B'],
      roles: { org1: 'admin', org2: 'secretary' },
    }

    expect(scoreUser(u, new Set(['u1']))).toBe(2000 + 1000 + 20 + 2 + 1)
  })
})
