import { jest } from '@jest/globals'

const mockLambda = jest.fn((_name, fn) => fn)
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

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 400 if orgId is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      role: 'secretary',
      userId: 'user456',
    })

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if trying to set own role', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      orgId: 'org789',
      role: 'secretary',
      userId: 'user123', // Same as authorized user
    })

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
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
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        email: 'test@example.com',
        id: 'user456',
        name: 'Test User',
        roles: {
          org789: 'secretary',
        },
      },
      event
    )
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
        email: 'test@example.com',
        id: 'user456',
        name: 'Test User',
        roles: {},
      },
      event
    )
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
