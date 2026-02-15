import type { JsonUser } from '../../types'
import { jest } from '@jest/globals'

jest.useFakeTimers()
jest.setSystemTime(new Date('2023-11-30T20:00:00Z'))
jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'test-id' }))

jest.unstable_mockModule('../lib/user', () => ({
  findUserByEmail: jest.fn(),
  updateUser: jest.fn(),
  userIsMemberOf: jest.fn(),
}))

const mockRead = jest.fn(async (): Promise<any> => undefined)
const mockWrite = jest.fn()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    read: mockRead,
    write: mockWrite,
  })),
}))

const logSpy = jest.spyOn(console, 'log').mockImplementation(() => null)
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => null)

const { findUserByEmail, updateUser } = await import('./user')
const { authorize, getAndUpdateUserByEmail, getUsername } = await import('./auth')

describe('auth', () => {
  afterEach(() => {
    jest.resetAllMocks()
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
      expect(logSpy).toHaveBeenCalledWith('no authorizer in requestContext', requestContext)
    })

    it('should return null if missing cognitoUser', async () => {
      const event = { requestContext: { authorizer: { claims: { sub: null } } } } as any
      const result = await authorize(event)

      expect(result).toBeNull()
      expect(logSpy).toHaveBeenCalledWith('no claims.sub in requestContext.autorizer', event.requestContext.authorizer)
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

      expect(logSpy).toHaveBeenCalledWith('claims', event.requestContext.authorizer.claims)
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

      ;(findUserByEmail as jest.MockedFunction<typeof findUserByEmail>).mockResolvedValue(existingUser)

      const result = await authorize(event)

      expect(warnSpy).toHaveBeenCalledWith(
        'no user link found; linking cognito user to existing user by email',
        expect.objectContaining({ cognitoUser, email: 'test@example.com', userId: 'existing-id' })
      )

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

      mockRead.mockResolvedValueOnce(existingUser)
      mockRead.mockResolvedValueOnce(link)

      const result = await authorize(event)

      expect(logSpy).toHaveBeenCalledWith('claims', event.requestContext.authorizer.claims)
      expect(mockRead).toHaveBeenCalledWith({ cognitoUser })
      expect(mockWrite).not.toHaveBeenCalled()
      expect(logSpy).not.toHaveBeenCalledWith('added user link', link)
      expect(result).toEqual(existingUser)
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
      expect(logSpy).toHaveBeenCalledWith('creating user', expectedUser)
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
      expect(logSpy).toHaveBeenCalledWith('creating user', expectedUser)
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
        ;(findUserByEmail as jest.MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce({
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
      ;(findUserByEmail as jest.MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce({
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
      ;(findUserByEmail as jest.MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce({
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        email: 'old@example.com',
        id: 'test-id',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        name: 'n',
      })

      await getAndUpdateUserByEmail('NEW@EXAMPLE.COM', {})

      expect(warnSpy).toHaveBeenCalledWith(
        'getAndUpdateUserByEmail: existing user email differs from claims email',
        expect.objectContaining({
          claimsEmail: 'new@example.com',
          existingEmail: 'old@example.com',
          userId: 'test-id',
        })
      )

      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
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
})
