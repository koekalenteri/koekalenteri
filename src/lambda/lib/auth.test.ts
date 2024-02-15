import type { JsonUser } from '../../types'

import { jest } from '@jest/globals'

jest.useFakeTimers()
jest.setSystemTime(new Date('2023-11-30T20:00:00Z'))
jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'test-id' }))

jest.unstable_mockModule('../lib/user', () => ({
  findUserByEmail: jest.fn(),
  updateUser: jest.fn(),
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

const { findUserByEmail, updateUser } = await import('./user')
const { authorize, getAndUpdateUserByEmail, getOrigin, getUsername } = await import('./auth')

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
          authorizer: { claims: { sub: cognitoUser, name: 'test-user', email: 'test@example.com' } },
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

    it('should return the user if link is found', async () => {
      const cognitoUser = 'cognito-user'
      const event = {
        requestContext: {
          authorizer: { claims: { sub: cognitoUser, name: 'test-user', email: 'test@example.com' } },
        },
      } as any
      const link = { cognitoUser, userId: 'test-id' }
      const existingUser = {
        id: 'test-id',
        name: 'test-user',
        email: 'test@example.com',
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
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
        id: 'test-id',
        name: '',
        email: 'address@domain.com',
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
      }

      expect(findUserByEmail).toHaveBeenCalledWith('address@domain.com')
      expect(logSpy).toHaveBeenCalledWith('creating user', expectedUser)
      expect(updateUser).toHaveBeenCalledWith(expectedUser)
    })

    it('should update lastSeen when requested', async () => {
      await getAndUpdateUserByEmail('user@example.com', {}, false, true)

      const expectedUser: JsonUser = {
        id: 'test-id',
        name: '',
        email: 'user@example.com',
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
        lastSeen: '2023-11-30T20:00:00.000Z',
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
          id: 'test-id',
          name: oldName,
          email: 'address@domain.com',
          createdAt: '2023-11-30T20:00:00.000Z',
          createdBy: 'system',
          modifiedAt: '2023-11-30T20:00:00.000Z',
          modifiedBy: 'system',
        })

        const user = await getAndUpdateUserByEmail('AddReSS@DoMaIn.COM', { name: newName })
        expect(user.name).toEqual(expected)
      }
    )

    it('should update name when requested', async () => {
      ;(findUserByEmail as jest.MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce({
        id: 'test-id',
        name: 'old name',
        email: 'user@email.com',
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
      })

      const user = await getAndUpdateUserByEmail('user@email.com', { name: 'new name' }, true)
      expect(user.name).toEqual('new name')
    })
  })

  describe('getOrigin', () => {
    it.each`
      event                | expected
      ${null}              | ${''}
      ${undefined}         | ${''}
      ${{}}                | ${''}
      ${{ headers: null }} | ${''}
    `('when event is $event, it should return "$expected"', ({ event, expected }) => {
      expect(getOrigin(event)).toEqual(expected)
    })

    it.each`
      event                                        | expected
      ${{ headers: null }}                         | ${''}
      ${{ headers: { origin: 'test' } }}           | ${'test'}
      ${{ headers: { Origin: 'test' } }}           | ${'test'}
      ${{ headers: { origin: 'a', Origin: 'b' } }} | ${'a'}
    `('when headers are $event.headers, it should return "$expected"', ({ event, expected }) => {
      expect(getOrigin(event)).toEqual(expected)
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
          authorizer: { claims: { sub: cognitoUser, name: 'test-user', email: 'test@example.com' } },
        },
      } as any
      const link = { cognitoUser, userId: 'test-id' }
      const existingUser = {
        id: 'test-id',
        name: 'test-user',
        email: 'test@example.com',
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
      }

      mockRead.mockResolvedValueOnce(existingUser)
      mockRead.mockResolvedValueOnce(link)

      const result = await getUsername(event)

      expect(result).toEqual('test-user')
    })
  })
})
