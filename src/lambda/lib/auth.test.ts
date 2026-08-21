import type { JsonUser } from '../../types'
import { vi } from 'vitest'

vi.useFakeTimers()
vi.setSystemTime(new Date('2023-11-30T20:00:00Z'))
vi.doMock('nanoid', () => ({ nanoid: () => 'test-id' }))

vi.doMock('../lib/user', () => ({
  findUserByEmail: vi.fn(),
  updateUser: vi.fn(),
  userIsMemberOf: vi.fn(),
}))

const mockRead = vi.fn(async (): Promise<any> => undefined)
const mockWrite = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      read: mockRead,
      write: mockWrite,
    }
  }),
}))

const logSpy = vi.spyOn(console, 'log').mockImplementation(() => null)
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => null)
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => null)

const { findUserByEmail, updateUser, userIsMemberOf } = await import('./user')
const { authorize, authorizeAdmin, authorizeWithMemberOf, getAndUpdateUserByEmail, getUsername } = await import(
  './auth'
)

describe('auth', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    logSpy.mockImplementation(() => null)
    warnSpy.mockImplementation(() => null)
    errorSpy.mockImplementation(() => null)
  })

  describe('authorize', () => {
    it.each`
      requestContext
      ${undefined}
      ${{}}
      ${{ authorizer: {} }}
      ${{ authorizer: { claims: null } }}
    `('should return null if missing event', async ({ requestContext }) => {
      const result = await authorize({ requestContext })

      expect(result).toBeNull()
      expect(logSpy).toHaveBeenCalledWith('no authorizer claims in request')
    })

    it('should return null if missing cognitoUser', async () => {
      const event = { requestContext: { authorizer: { claims: { sub: null } } } } as any
      const result = await authorize(event)

      expect(result).toBeNull()
      expect(logSpy).toHaveBeenCalledWith('no subject in authorizer claims')
    })

    it('should parse JSON-string claims from ws custom authorizer context', async () => {
      const cognitoUser = 'cognito-user'
      const claims = { email: 'test@example.com', name: 'test-user', sub: cognitoUser }
      const event = {
        requestContext: {
          authorizer: { claims: JSON.stringify(claims) },
        },
      } as any

      await authorize(event)

      expect(logSpy).not.toHaveBeenCalledWith('claims', claims)
      expect(mockRead).toHaveBeenCalledWith({ cognitoUser })
    })

    it('should return null for non-JSON string claims', async () => {
      const event = {
        requestContext: {
          authorizer: { claims: 'not-json' },
        },
      } as any

      const result = await authorize(event)

      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith('authorizer.claims was a non-JSON string')
      expect(logSpy).toHaveBeenCalledWith('no authorizer claims in request')
    })

    it('should create link if not found', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { email: 'test@example.com', name: 'test-user', sub: cognitoUser } },
        },
      } as any
      const link = { cognitoUser, userId: 'test-id' }

      const result = await authorize(event)

      expect(logSpy).not.toHaveBeenCalledWith('claims', event.requestContext.authorizer.claims)
      expect(mockRead).toHaveBeenCalledWith({ cognitoUser })
      expect(mockWrite).toHaveBeenCalledWith(link, 'user-link-table-not-found-in-env')
      expect(logSpy).toHaveBeenCalledWith('added user link', link)
      expect(result).toEqual({
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test-user',
      })
    })

    it('should link cognito user to an existing user found by email if link is missing (KL email change mitigation)', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { email: 'Test@Example.com', name: 'test-user', sub: cognitoUser } },
        },
      } as any

      const existingUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'existing-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'existing name',
      } satisfies JsonUser

      ;(findUserByEmail as import('vitest').MockedFunction<typeof findUserByEmail>).mockResolvedValue(existingUser)

      const result = await authorize(event)

      expect(warnSpy).toHaveBeenCalledWith('no user link found; linking cognito user to existing user by email', {
        cognitoUser,
        userId: 'existing-id',
      })

      // First: mitigation lookup by normalized email.
      expect(findUserByEmail).toHaveBeenCalledWith('test@example.com')

      // Link should be created against the existing id, not a new nanoid.
      expect(mockWrite).toHaveBeenCalledWith({ cognitoUser, userId: 'existing-id' }, 'user-link-table-not-found-in-env')
      expect(result?.id).toBe('existing-id')
      expect(result?.email).toBe('test@example.com')
    })

    it('should return the user if link is found', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { email: 'test@example.com', name: 'test-user', sub: cognitoUser } },
        },
      } as any
      const link = { cognitoUser, userId: 'test-id' }
      const existingUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test-user',
      }

      // auth reads link first, then loads user by id
      mockRead.mockResolvedValueOnce(link)
      mockRead.mockResolvedValueOnce(existingUser)

      const result = await authorize(event)

      expect(logSpy).not.toHaveBeenCalledWith('claims', event.requestContext.authorizer.claims)
      expect(mockRead).toHaveBeenCalledWith({ cognitoUser })
      expect(mockWrite).not.toHaveBeenCalled()
      expect(logSpy).not.toHaveBeenCalledWith('added user link', link)
      expect(result).toEqual(existingUser)
    })

    it('should not update user when no changes detected', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { email: 'test@example.com', name: 'test-user', sub: cognitoUser } },
        },
      } as any
      const link = { cognitoUser, userId: 'test-id' }
      const existingUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test-user',
      }

      mockRead.mockResolvedValueOnce(link)
      mockRead.mockResolvedValueOnce(existingUser)

      const result = await authorize(event)

      expect(result).toEqual(existingUser)
      expect(updateUser).not.toHaveBeenCalled()
    })

    it('should normalize email to empty string when claims email is not a string', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { email: null, name: 'test-user', sub: cognitoUser } },
        },
      } as any

      const existingUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'existing-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'existing name',
      } satisfies JsonUser

      ;(findUserByEmail as import('vitest').MockedFunction<typeof findUserByEmail>).mockResolvedValue(existingUser)

      const result = await authorize(event)

      expect(findUserByEmail).toHaveBeenCalledWith('')
      expect(result?.id).toBe('existing-id')
    })

    it('should replace non-string stored name when updating existing linked user', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { email: 'test@example.com', name: 'fixed-name', sub: cognitoUser } },
        },
      } as any
      const link = { cognitoUser, userId: 'test-id' }
      const existingUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 1234,
      } as unknown as JsonUser

      mockRead.mockResolvedValueOnce(link)
      mockRead.mockResolvedValueOnce(existingUser)

      const result = await authorize(event, true)

      expect(result?.name).toBe('')
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-id',
          lastSeen: '2023-11-30T20:00:00.000Z',
          name: '',
        })
      )
    })

    it('should not update linked user lastSeen when it was recently updated', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { email: 'test@example.com', name: 'test-user', sub: cognitoUser } },
        },
      } as any
      const link = { cognitoUser, userId: 'test-id' }
      const existingUser: JsonUser = {
        createdAt: '2023-11-30T19:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'test-id',
        lastSeen: '2023-11-30T19:55:00.000Z',
        modifiedAt: '2023-11-30T19:00:00.000Z',
        modifiedBy: 'system',
        name: 'test-user',
      }

      mockRead.mockResolvedValueOnce(link)
      mockRead.mockResolvedValueOnce(existingUser)

      const result = await authorize(event, true)

      expect(result).toEqual(existingUser)
      expect(updateUser).not.toHaveBeenCalled()
    })
  })

  describe('getAndUpdateUserByEmail', () => {
    it('should use lower case email', async () => {
      await getAndUpdateUserByEmail('AddReSS@DoMaIn.COM', {})

      const expectedUser: JsonUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'address@domain.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: '',
      }

      expect(findUserByEmail).toHaveBeenCalledWith('address@domain.com')
      expect(logSpy).toHaveBeenCalledWith('creating user', {
        changedKeys: Object.keys(expectedUser),
        userId: 'test-id',
      })
      expect(updateUser).toHaveBeenCalledWith(expectedUser)
    })

    it('should trim whitespace from email', async () => {
      await getAndUpdateUserByEmail(' AddReSS@DoMaIn.COM\n', {})

      const expectedUser: JsonUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'address@domain.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: '',
      }

      expect(findUserByEmail).toHaveBeenCalledWith('address@domain.com')
      expect(logSpy).toHaveBeenCalledWith('creating user', {
        changedKeys: Object.keys(expectedUser),
        userId: 'test-id',
      })
      expect(updateUser).toHaveBeenCalledWith(expectedUser)
    })

    it('should update lastSeen when requested', async () => {
      await getAndUpdateUserByEmail('user@example.com', {}, false, true)

      const expectedUser: JsonUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'user@example.com',
        id: 'test-id',
        lastSeen: '2023-11-30T20:00:00.000Z',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: '',
      }

      expect(updateUser).toHaveBeenCalledWith(expectedUser)
    })

    it('should not update existing user lastSeen when it was recently updated', async () => {
      const existingUser: JsonUser = {
        createdAt: '2023-11-30T19:00:00.000Z',
        createdBy: 'system',
        email: 'user@example.com',
        id: 'test-id',
        lastSeen: '2023-11-30T19:55:00.000Z',
        modifiedAt: '2023-11-30T19:00:00.000Z',
        modifiedBy: 'system',
        name: '',
      }
      ;(findUserByEmail as import('vitest').MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce(existingUser)

      const result = await getAndUpdateUserByEmail('user@example.com', {}, false, true)

      expect(result).toEqual(existingUser)
      expect(updateUser).not.toHaveBeenCalled()
    })

    it.each`
      oldName       | newName       | expected
      ${'Old Name'} | ${'New Name'} | ${'Old Name'}
      ${'Old Name'} | ${undefined}  | ${'Old Name'}
      ${undefined}  | ${'New Name'} | ${'New Name'}
      ${undefined}  | ${undefined}  | ${''}
      ${''}         | ${'New Name'} | ${'New Name'}
    `(
      'with oldName="$oldName", newName="$newName" should result to "$expected"',
      async ({ oldName, newName, expected }) => {
        ;(findUserByEmail as import('vitest').MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce({
          createdAt: '2023-11-30T20:00:00.000Z',
          createdBy: 'system',
          email: 'address@domain.com',
          id: 'test-id',
          modifiedAt: '2023-11-30T20:00:00.000Z',
          modifiedBy: 'system',
          name: oldName,
        })

        const user = await getAndUpdateUserByEmail('AddReSS@DoMaIn.COM', { name: newName })
        expect(user.name).toEqual(expected)
      }
    )

    it('should update name when requested', async () => {
      ;(findUserByEmail as import('vitest').MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce({
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'user@email.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'old name',
      })

      const user = await getAndUpdateUserByEmail('user@email.com', { name: 'new name' }, true)
      expect(user.name).toEqual('new name')
    })

    it('should append emailHistory when existing email changes via login', async () => {
      ;(findUserByEmail as import('vitest').MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce({
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'old@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'n',
      })

      await getAndUpdateUserByEmail('NEW@EXAMPLE.COM', {})

      expect(warnSpy).toHaveBeenCalledWith('getAndUpdateUserByEmail: existing user email differs from claims email', {
        userId: 'test-id',
      })

      // We do not overwrite stored email on login, but we do record the observed change in emailHistory.
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'old@example.com',
          emailHistory: [{ changedAt: '2023-11-30T20:00:00.000Z', email: 'old@example.com', source: 'login' }],
        })
      )
    })
  })

  describe('getUsername', () => {
    it('should return anonymous when user can not be determined', async () => {
      const result = await getUsername({})

      expect(result).toEqual('anonymous')
    })

    it('should return the user name if user is found', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { email: 'test@example.com', name: 'test-user', sub: cognitoUser } },
        },
      } as any
      const link = { cognitoUser, userId: 'test-id' }
      const existingUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test-user',
      }

      mockRead.mockResolvedValueOnce(existingUser)
      mockRead.mockResolvedValueOnce(link)

      const result = await getUsername(event)

      expect(result).toEqual('test-user')
    })
  })

  describe('authorizeWithMemberOf', () => {
    it('should return Unauthorized when user cannot be resolved', async () => {
      const event = { headers: {}, requestContext: { authorizer: { claims: null } } } as any

      const result = await authorizeWithMemberOf(event)

      expect(result).toEqual({ res: expect.objectContaining({ statusCode: 401 }) })
    })

    it('should return Forbidden when not member and not admin', async () => {
      const event = {
        headers: {},
        requestContext: {
          authorizer: { claims: { email: 'test@example.com', name: 'test-user', sub: 'cognito-user' } },
        },
      } as any

      const link = { cognitoUser: 'cognito-user', userId: 'test-id' }
      const existingUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test-user',
      }

      mockRead.mockResolvedValueOnce(link)
      mockRead.mockResolvedValueOnce(existingUser)
      ;(userIsMemberOf as import('vitest').MockedFunction<typeof userIsMemberOf>).mockReturnValue([])

      const result = await authorizeWithMemberOf(event)

      expect(result.res?.statusCode).toBe(403)
      expect(result.user).toEqual(existingUser)
      expect(errorSpy).toHaveBeenCalledWith('User test-id is not admin or member of any organizations.')
    })

    it('should return memberOf list when user is a member', async () => {
      const event = {
        headers: {},
        requestContext: {
          authorizer: { claims: { email: 'test@example.com', name: 'test-user', sub: 'cognito-user' } },
        },
      } as any

      const link = { cognitoUser: 'cognito-user', userId: 'test-id' }
      const existingUser = {
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'test@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'test-user',
      }

      mockRead.mockResolvedValueOnce(link)
      mockRead.mockResolvedValueOnce(existingUser)
      ;(userIsMemberOf as import('vitest').MockedFunction<typeof userIsMemberOf>).mockReturnValue(['org-1'])

      const result = await authorizeWithMemberOf(event)

      expect(result).toEqual({ memberOf: ['org-1'], user: existingUser })
    })
  })

  describe('authorizeAdmin', () => {
    const event = {
      headers: {},
      requestContext: {
        authorizer: { claims: { email: 'test@example.com', name: 'test-user', sub: 'cognito-user' } },
      },
    } as any
    const link = { cognitoUser: 'cognito-user', userId: 'test-id' }
    const user = {
      createdAt: '2023-11-30T20:00:00.000Z',
      createdBy: 'system',
      email: 'test@example.com',
      id: 'test-id',
      modifiedAt: '2023-11-30T20:00:00.000Z',
      modifiedBy: 'system',
      name: 'test-user',
    }

    it('returns Unauthorized when the user cannot be resolved', async () => {
      const result = await authorizeAdmin({ headers: {}, requestContext: { authorizer: { claims: null } } } as any)

      expect(result).toEqual({ res: expect.objectContaining({ statusCode: 401 }) })
    })

    it('returns Forbidden for an authenticated non-admin', async () => {
      mockRead.mockResolvedValueOnce(link)
      mockRead.mockResolvedValueOnce(user)

      const result = await authorizeAdmin(event)

      expect(result.res).toEqual(expect.objectContaining({ statusCode: 403 }))
      expect(result.user).toEqual(user)
    })

    it('returns the authenticated admin user', async () => {
      const admin = { ...user, admin: true }
      mockRead.mockResolvedValueOnce(link)
      mockRead.mockResolvedValueOnce(admin)

      await expect(authorizeAdmin(event)).resolves.toEqual({ user: admin })
    })
  })
})
