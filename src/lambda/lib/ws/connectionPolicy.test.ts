import { canReceiveAdminEvent, canReceivePublicEvent, isConnectionExpired } from './connectionPolicy'

describe('ws/connectionPolicy', () => {
  describe('isConnectionExpired', () => {
    it('returns false when expiresAt is missing', () => {
      expect(isConnectionExpired({ connectionId: 'c1' } as any)).toBe(false)
    })

    it('returns true when expiresAt is in the past', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(isConnectionExpired({ connectionId: 'c1', expiresAt: now - 1 } as any)).toBe(true)
    })

    it('returns false when expiresAt is in the future', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(isConnectionExpired({ connectionId: 'c1', expiresAt: now + 60 } as any)).toBe(false)
    })
  })

  describe('canReceiveAdminEvent', () => {
    it('returns false for expired connections', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(canReceiveAdminEvent({ connectionId: 'c1', expiresAt: now - 1 } as any, 'org-1')).toBe(false)
    })

    it('returns true for admin connections', () => {
      expect(canReceiveAdminEvent({ admin: true, connectionId: 'c1' } as any, 'org-1')).toBe(true)
    })

    it('returns false for non-admin when organizerId is missing', () => {
      expect(canReceiveAdminEvent({ admin: false, connectionId: 'c1', memberOf: ['org-1'] } as any)).toBe(false)
    })

    it('returns true when non-admin belongs to organizer', () => {
      expect(canReceiveAdminEvent({ admin: false, connectionId: 'c1', memberOf: ['org-1'] } as any, 'org-1')).toBe(true)
    })

    it('returns false when non-admin does not belong to organizer', () => {
      expect(canReceiveAdminEvent({ admin: false, connectionId: 'c1', memberOf: ['org-2'] } as any, 'org-1')).toBe(
        false
      )
    })
  })

  describe('canReceivePublicEvent', () => {
    it('returns false for expired connections', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(canReceivePublicEvent({ connectionId: 'c1', expiresAt: now - 1 } as any)).toBe(false)
    })

    it('returns true for active connections', () => {
      expect(canReceivePublicEvent({ connectionId: 'c1' } as any)).toBe(true)
    })
  })
})
