import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockGetOrigin = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockGetAndUpdateUserByEmail = jest.fn<any>()
const mockSetUserRole = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
  getAndUpdateUserByEmail: mockGetAndUpdateUserByEmail,
}))

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: mockGetOrigin,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../lib/user', () => ({
  setUserRole: mockSetUserRole,
}))

const { default: putUserLambda } = await import('./handler')

describe('putUserLambda', () => {
  const event = {
    body: JSON.stringify({
      email: 'test@example.com',
      name: 'Test User',
      roles: {
        org123: 'secretary',
        org456: 'admin',
      },
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Admin User',
      roles: {},
    })

    mockGetOrigin.mockReturnValue('https://example.com')

    mockParseJSONWithFallback.mockReturnValue({
      email: 'test@example.com',
      name: 'Test User',
      roles: {
        org123: 'secretary',
        org456: 'admin',
      },
    })

    mockGetAndUpdateUserByEmail.mockResolvedValue({
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
      roles: {},
    })

    mockSetUserRole.mockImplementation((user: any, orgId: string, role: string) => {
      const updatedUser = { ...user }
      if (role === 'none') {
        delete updatedUser.roles[orgId]
      } else {
        updatedUser.roles = { ...updatedUser.roles, [orgId]: role }
      }
      return Promise.resolve(updatedUser)
    })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await putUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('returns 403 if user is not an admin and has no admin roles', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Regular User',
      roles: {
        org123: 'secretary', // Not an admin role
      },
    })

    await putUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockGetAndUpdateUserByEmail).not.toHaveBeenCalled()
  })

  it('allows users with admin role for an organization', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Org Admin',
      roles: {
        org123: 'admin', // Admin for this org
      },
    })

    await putUserLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' })
    expect(mockResponse).not.toHaveBeenCalledWith(403, 'Forbidden', event)
  })

  it('updates user name and roles successfully', async () => {
    await putUserLambda(event)

    // Verify user was retrieved and updated
    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' })

    // Verify roles were set
    expect(mockSetUserRole).toHaveBeenCalledTimes(2)
    expect(mockSetUserRole).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        id: 'user456',
        name: 'Test User',
      }),
      'org123',
      'secretary',
      'Admin User',
      'https://example.com'
    )
    expect(mockSetUserRole).toHaveBeenCalledWith(
      expect.any(Object),
      'org456',
      'admin',
      'Admin User',
      'https://example.com'
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('handles empty roles object', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      email: 'test@example.com',
      name: 'Test User',
      roles: {},
    })

    await putUserLambda(event)

    // Verify user was retrieved and updated
    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' })

    // Verify no roles were set
    expect(mockSetUserRole).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('handles undefined roles', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      email: 'test@example.com',
      name: 'Test User',
      // No roles property
    })

    await putUserLambda(event)

    // Verify user was retrieved and updated
    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' })

    // Verify no roles were set
    expect(mockSetUserRole).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('throws an error if getAndUpdateUserByEmail fails', async () => {
    const error = new Error('User not found')
    mockGetAndUpdateUserByEmail.mockRejectedValueOnce(error)

    await expect(putUserLambda(event)).rejects.toThrow('User not found')

    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' })
    expect(mockSetUserRole).not.toHaveBeenCalled()
  })

  it('throws an error if setUserRole fails', async () => {
    const error = new Error('Role update failed')
    mockSetUserRole.mockRejectedValueOnce(error)

    await expect(putUserLambda(event)).rejects.toThrow('Role update failed')

    expect(mockGetAndUpdateUserByEmail).toHaveBeenCalledWith('test@example.com', { name: 'Test User' })
    expect(mockSetUserRole).toHaveBeenCalledTimes(1)
  })
})
