import { vi } from 'vitest'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'

const setEventBody = (event: { body: string | null }, body: unknown) => {
  event.body = JSON.stringify(body)
}

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockReadUser = vi.fn()
const mockWriteUserAdmin = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

vi.doMock('../lib/repositories/userRepository', () => ({
  readUser: mockReadUser,
  writeUserAdmin: mockWriteUserAdmin,
}))

const { default: setAdminLambda } = await import('./handler')

describe('setAdminLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: JSON.stringify({
      admin: true,
      userId: 'user456',
    }),
    headers: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Test Admin',
    })

    setEventBody(event, {
      admin: true,
      userId: 'user456',
    })

    mockReadUser.mockResolvedValue({
      admin: false,
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
    })

    mockWriteUserAdmin.mockResolvedValue({})
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockReadUser).not.toHaveBeenCalled()
  })

  it('returns 400 if userId is missing', async () => {
    setEventBody(event, {
      admin: true,
    })

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockReadUser).not.toHaveBeenCalled()
  })

  it('returns 403 if trying to set own admin status', async () => {
    setEventBody(event, {
      admin: false,
      userId: 'user123', // Same as authorized user
    })

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockReadUser).not.toHaveBeenCalled()
  })

  it('returns 403 if not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test User',
    })

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockReadUser).not.toHaveBeenCalled()
  })

  it('returns 404 if user is not found', async () => {
    mockReadUser.mockResolvedValueOnce(null)

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockReadUser).toHaveBeenCalledWith('user456')
    expect(mockResponse).toHaveBeenCalledWith(404, 'Not found', event)
    expect(mockWriteUserAdmin).not.toHaveBeenCalled()
  })

  it('grants admin privileges successfully', async () => {
    await setAdminLambda(event)

    // Verify user was retrieved
    expect(mockReadUser).toHaveBeenCalledWith('user456')

    // Verify user was updated with admin privileges
    expect(mockWriteUserAdmin).toHaveBeenCalledWith('user456', true, expect.any(String), 'Test Admin')

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        admin: true,
        email: 'test@example.com',
        id: 'user456',
        name: 'Test User',
        userId: 'user456',
      },
      event
    )
  })

  it('revokes admin privileges successfully', async () => {
    setEventBody(event, {
      admin: false,
      userId: 'user456',
    })

    mockReadUser.mockResolvedValueOnce({
      admin: true,
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
    })

    await setAdminLambda(event)

    // Verify user was retrieved
    expect(mockReadUser).toHaveBeenCalledWith('user456')

    // Verify user was updated with admin privileges revoked
    expect(mockWriteUserAdmin).toHaveBeenCalledWith('user456', false, expect.any(String), 'Test Admin')

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        admin: false,
        email: 'test@example.com',
        id: 'user456',
        name: 'Test User',
        userId: 'user456',
      },
      event
    )
  })

  it('preserves existing user fields when updating', async () => {
    mockReadUser.mockResolvedValueOnce({
      address: '123 Main St',
      admin: false,
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
      phone: '1234567890',
      userId: 'user456',
    })

    await setAdminLambda(event)

    // Verify response includes all existing fields
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        address: '123 Main St',
        admin: true,
        email: 'test@example.com',
        id: 'user456',
        name: 'Test User',
        phone: '1234567890',
        userId: 'user456',
      },
      event
    )
  })
})
