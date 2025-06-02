import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockGetOrigin = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockSetUserRole = jest.fn<any>()
const mockRead = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
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

const { default: setRoleLambda } = await import('./handler')

describe('setRoleLambda', () => {
  const event = {
    body: JSON.stringify({
      userId: 'user456',
      orgId: 'org789',
      role: 'secretary',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Spy on console methods to prevent logs from being displayed
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test Admin',
      admin: true,
      roles: {
        org789: 'admin',
      },
    })

    mockGetOrigin.mockReturnValue('https://example.com')

    mockParseJSONWithFallback.mockReturnValue({
      userId: 'user456',
      orgId: 'org789',
      role: 'secretary',
    })

    mockRead.mockResolvedValue({
      id: 'user456',
      name: 'Test User',
      email: 'test@example.com',
      roles: {},
    })

    mockSetUserRole.mockResolvedValue({
      id: 'user456',
      name: 'Test User',
      email: 'test@example.com',
      roles: {
        org789: 'secretary',
      },
    })
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 400 if orgId is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      userId: 'user456',
      role: 'secretary',
    })

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if trying to set own role', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      userId: 'user123', // Same as authorized user
      orgId: 'org789',
      role: 'secretary',
    })

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if not an admin or organizer admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      id: 'user123',
      name: 'Test User',
      admin: false,
      roles: {
        org789: 'secretary', // Not admin role
      },
    })

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 404 if user is not found', async () => {
    mockRead.mockResolvedValueOnce(null)

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })
    expect(mockResponse).toHaveBeenCalledWith(404, 'Not found', event)
    expect(mockSetUserRole).not.toHaveBeenCalled()
  })

  it('sets user role successfully as global admin', async () => {
    await setRoleLambda(event)

    // Verify origin was retrieved
    expect(mockGetOrigin).toHaveBeenCalledWith(event)

    // Verify user was retrieved
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })

    // Verify user role was set
    expect(mockSetUserRole).toHaveBeenCalledWith(
      {
        id: 'user456',
        name: 'Test User',
        email: 'test@example.com',
        roles: {},
      },
      'org789',
      'secretary',
      'Test Admin',
      'https://example.com'
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        id: 'user456',
        name: 'Test User',
        email: 'test@example.com',
        roles: {
          org789: 'secretary',
        },
      },
      event
    )
  })

  it('sets user role successfully as organizer admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      id: 'user123',
      name: 'Test Organizer Admin',
      admin: false,
      roles: {
        org789: 'admin', // Admin for this organizer
      },
    })

    await setRoleLambda(event)

    // Verify user role was set
    expect(mockSetUserRole).toHaveBeenCalledWith(
      expect.any(Object),
      'org789',
      'secretary',
      'Test Organizer Admin',
      expect.any(String)
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, expect.any(Object), event)
  })

  it('removes user role when role is "none"', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      userId: 'user456',
      orgId: 'org789',
      role: 'none',
    })

    mockRead.mockResolvedValueOnce({
      id: 'user456',
      name: 'Test User',
      email: 'test@example.com',
      roles: {
        org789: 'secretary',
      },
    })

    mockSetUserRole.mockResolvedValueOnce({
      id: 'user456',
      name: 'Test User',
      email: 'test@example.com',
      roles: {}, // Role removed
    })

    await setRoleLambda(event)

    // Verify user role was set to 'none'
    expect(mockSetUserRole).toHaveBeenCalledWith(
      expect.any(Object),
      'org789',
      'none',
      expect.any(String),
      expect.any(String)
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        id: 'user456',
        name: 'Test User',
        email: 'test@example.com',
        roles: {},
      },
      event
    )
  })

  it('logs warning when trying to set own roles', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      userId: 'user123', // Same as authorized user
      orgId: 'org789',
      role: 'secretary',
    })

    await setRoleLambda(event)

    // Verify warning was logged
    expect(console.warn).toHaveBeenCalledWith('Trying to set own roles', expect.any(Object))
  })

  it('logs warning when user does not have right to set role', async () => {
    mockAuthorize.mockResolvedValueOnce({
      id: 'user123',
      name: 'Test User',
      admin: false,
      roles: {
        other_org: 'admin', // Admin for different organizer
      },
    })

    await setRoleLambda(event)

    // Verify warning was logged
    expect(console.warn).toHaveBeenCalledWith('User does not have right to set role', expect.any(Object))
  })
})
