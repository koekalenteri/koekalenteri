import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetOrigin = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockSetUserRole = jest.fn<any>()
const mockRead = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
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

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
  })),
}))

const { setRoleLambda } = await import('./handler')

describe('setRoleLambda', () => {
  const event = {
    body: JSON.stringify({
      orgId: 'org789',
      role: 'secretary',
      userId: 'user456',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Spy on console methods to prevent logs from being displayed
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Test Admin',
      roles: {
        org789: 'admin',
      },
    })

    mockGetOrigin.mockReturnValue('https://example.com')

    mockParseJSONWithFallback.mockReturnValue({
      orgId: 'org789',
      role: 'secretary',
      userId: 'user456',
    })

    mockRead.mockResolvedValue({
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
      roles: {},
    })

    mockSetUserRole.mockResolvedValue({
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
      roles: {
        org789: 'secretary',
      },
    })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 400 if orgId is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      role: 'secretary',
      userId: 'user456',
    })

    const result = await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(result.statusCode).toBe(400)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if trying to set own role', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      orgId: 'org789',
      role: 'secretary',
      userId: 'user123', // Same as authorized user
    })

    const result = await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(result.statusCode).toBe(403)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if not an admin or organizer admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test User',
      roles: {
        org789: 'secretary', // Not admin role
      },
    })

    const result = await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(result.statusCode).toBe(403)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 404 if user is not found', async () => {
    mockRead.mockResolvedValueOnce(null)

    const result = await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })
    expect(result.statusCode).toBe(404)
    expect(mockSetUserRole).not.toHaveBeenCalled()
  })

  it('sets user role successfully as global admin', async () => {
    const result = await setRoleLambda(event)

    // Verify origin was retrieved
    expect(mockGetOrigin).toHaveBeenCalledWith(event)

    // Verify user was retrieved
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })

    // Verify user role was set
    expect(mockSetUserRole).toHaveBeenCalledWith(
      {
        email: 'test@example.com',
        id: 'user456',
        name: 'Test User',
        roles: {},
      },
      'org789',
      'secretary',
      'Test Admin',
      'https://example.com'
    )

    // Verify response was returned
    expect(result.statusCode).toBe(200)
  })

  it('sets user role successfully as organizer admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test Organizer Admin',
      roles: {
        org789: 'admin', // Admin for this organizer
      },
    })

    const result = await setRoleLambda(event)

    // Verify user role was set
    expect(mockSetUserRole).toHaveBeenCalledWith(
      expect.any(Object),
      'org789',
      'secretary',
      'Test Organizer Admin',
      expect.any(String)
    )

    // Verify response was returned
    expect(result.statusCode).toBe(200)
  })

  it('removes user role when role is "none"', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      orgId: 'org789',
      role: 'none',
      userId: 'user456',
    })

    mockRead.mockResolvedValueOnce({
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
      roles: {
        org789: 'secretary',
      },
    })

    mockSetUserRole.mockResolvedValueOnce({
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
      roles: {}, // Role removed
    })

    const result = await setRoleLambda(event)

    // Verify user role was set to 'none'
    expect(mockSetUserRole).toHaveBeenCalledWith(
      expect.any(Object),
      'org789',
      'none',
      expect.any(String),
      expect.any(String)
    )

    // Verify response was returned
    expect(result.statusCode).toBe(200)
  })

  it('logs warning when trying to set own roles', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      orgId: 'org789',
      role: 'secretary',
      userId: 'user123', // Same as authorized user
    })

    await setRoleLambda(event)

    // Verify warning was logged
    expect(console.warn).toHaveBeenCalledWith('Trying to set own roles', expect.any(Object))
  })

  it('logs warning when user does not have right to set role', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test User',
      roles: {
        other_org: 'admin', // Admin for different organizer
      },
    })

    await setRoleLambda(event)

    // Verify warning was logged
    expect(console.warn).toHaveBeenCalledWith('User does not have right to set role', expect.any(Object))
  })
})
