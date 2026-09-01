import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const setEventBody = (event: { body: string | null }, body: unknown) => {
  event.body = JSON.stringify(body)
}

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockGetFrontendOrigin = vi.fn()
const mockSetUserRole = vi.fn()
const mockRead = vi.fn()

vi.doMock('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

vi.doMock('../lib/api-gw', () => ({
  getFrontendOrigin: mockGetFrontendOrigin,
}))

vi.doMock('../lib/user', () => ({
  setUserRole: mockSetUserRole,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      read: mockRead,
    }
  }),
}))

const { default: setRoleLambda } = await import('./handler')

describe('setRoleLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: JSON.stringify({
      orgId: 'org789',
      role: 'secretary',
      userId: 'user456',
    }),
    headers: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Spy on console methods to prevent logs from being displayed
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Test Admin',
      roles: {
        org789: 'admin',
      },
    })

    mockGetFrontendOrigin.mockReturnValue('https://example.com')

    setEventBody(event, {
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
    setEventBody(event, {
      role: 'secretary',
      userId: 'user456',
    })

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if trying to set own role', async () => {
    setEventBody(event, {
      orgId: 'org789',
      role: 'secretary',
      userId: 'user123', // Same as authorized user
    })

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
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
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 404 if user is not found', async () => {
    mockRead.mockResolvedValueOnce(null)

    await setRoleLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })
    expect(mockResponse).toHaveBeenCalledWith(404, 'Not found', event)
    expect(mockSetUserRole).not.toHaveBeenCalled()
  })

  it('sets user role successfully as global admin', async () => {
    await setRoleLambda(event)

    // Verify origin was retrieved
    expect(mockGetFrontendOrigin).toHaveBeenCalledWith(event)

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
    setEventBody(event, {
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
    setEventBody(event, {
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
