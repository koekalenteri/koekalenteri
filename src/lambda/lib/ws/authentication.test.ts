import type { JsonUser } from '../../../types'
import type { UserLink } from '../repositories/userLinkRepository'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../../test-utils/helpers'
import { canReceiveAdminEvent, canReceiveAnyAdminEvent } from './connectionPolicy'

const mockVerify = vi.fn<(token: string) => Promise<Record<string, unknown>>>()
const mockReadUserLink = vi.fn<(cognitoUser: string) => Promise<UserLink | undefined>>()
const mockReadUser = vi.fn<(id: string) => Promise<JsonUser | undefined>>()

// Cognito's signature check is the boundary: the token itself is not what these tests are about.
vi.doMock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: () => ({ verify: mockVerify }) },
}))
vi.doMock('../repositories/userLinkRepository', () => ({
  readAllUserLinks: vi.fn(),
  readUserLink: mockReadUserLink,
  writeUserLink: vi.fn(),
}))
vi.doMock('../repositories/userRepository', () => ({
  queryUsersByEmail: vi.fn(),
  readAllUsers: vi.fn(),
  readUser: mockReadUser,
  writeUser: vi.fn(),
  writeUserRoles: vi.fn(),
  writeUsers: vi.fn(),
}))

const { authenticateWebSocketToken } = await import('./authentication')

/** Authentication reads only the requestContext, whose claims it replaces with the verified token's. */
const event = constructAPIGwEvent({})

const claims = { email: 'viewer@example.com', exp: 2000000000, name: 'Viewer Name', sub: 'cognito-viewer' }

const signedInAs = (user: Partial<JsonUser>) => {
  mockVerify.mockResolvedValueOnce(claims)
  mockReadUserLink.mockResolvedValueOnce({ cognitoUser: 'cognito-viewer', userId: 'user-1' })
  mockReadUser.mockResolvedValueOnce({
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system',
    email: 'viewer@example.com',
    id: 'user-1',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    modifiedBy: 'system',
    name: 'Viewer Name',
    ...user,
  })
}

describe('ws/authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The run unstubs the environment after every test.
    vi.stubEnv('COGNITO_USER_POOL_ID', 'eu-north-1_pool')
    vi.stubEnv('COGNITO_APP_CLIENT_ID', 'client-id')
  })

  describe('authenticateWebSocketToken', () => {
    it('authenticates a signed-in user without any role, who may watch only the public channels', async () => {
      signedInAs({})

      const auth = await authenticateWebSocketToken(event, 'id-token')

      expect(mockVerify).toHaveBeenCalledWith('id-token')
      expect(auth).toEqual({
        admin: false,
        expiresAt: 2000000000,
        memberOf: [],
        userEmail: 'viewer@example.com',
        userId: 'user-1',
        userName: 'Viewer Name',
      })
      const connection = { connectionId: 'conn-1', ...auth }
      expect(canReceiveAnyAdminEvent(connection)).toBe(false)
      expect(canReceiveAdminEvent(connection, 'org-1')).toBe(false)
    })

    it('carries the clubs an organizer holds a role in', async () => {
      signedInAs({ roles: { 'org-1': 'secretary', 'org-2': 'admin' } })

      const auth = await authenticateWebSocketToken(event, 'id-token')

      expect(auth).toMatchObject({ admin: false, memberOf: ['org-1', 'org-2'], userId: 'user-1' })
      const connection = { connectionId: 'conn-1', ...auth }
      expect(canReceiveAdminEvent(connection, 'org-1')).toBe(true)
      expect(canReceiveAdminEvent(connection, 'org-3')).toBe(false)
    })

    it('carries the admin flag of a user without club roles', async () => {
      signedInAs({ admin: true })

      const auth = await authenticateWebSocketToken(event, 'id-token')

      expect(auth).toMatchObject({ admin: true, memberOf: [], userId: 'user-1' })
      expect(canReceiveAdminEvent({ connectionId: 'conn-1', ...auth }, 'org-3')).toBe(true)
    })

    it('refuses a valid token whose user cannot be resolved with 401', async () => {
      mockVerify.mockResolvedValueOnce({ ...claims, sub: undefined })

      await expect(authenticateWebSocketToken(event, 'id-token')).rejects.toMatchObject({
        body: 'Unauthorized',
        status: 401,
      })
    })

    it('rejects a token the verifier refuses before any user is read', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Token expired'))

      await expect(authenticateWebSocketToken(event, 'id-token')).rejects.toThrow('Token expired')
      expect(mockReadUserLink).not.toHaveBeenCalled()
    })
  })
})
