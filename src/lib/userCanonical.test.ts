import type { User } from '../types'

import { scoreUser } from './userCanonical'

describe('lib/userCanonical', () => {
  it('scoreUser includes link/admin/roles/officer/judge weights', () => {
    const u: User = {
      id: 'u1',
      name: 'U1',
      email: 'u1@example.com',
      admin: true,
      roles: { org1: 'admin', org2: 'secretary' },
      officer: ['NOME-A', 'NOME-B'],
      judge: ['NOME-A'],
    }

    expect(scoreUser(u, new Set(['u1']))).toBe(2000 + 1000 + 20 + 2 + 1)
  })
})
