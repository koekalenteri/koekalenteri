import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/json', () => ({
  parseJSONWithFallback: mockParseJSONWithFallback,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
    update: mockUpdate,
  })),
}))

const { default: setAdminLambda } = await import('./handler')

describe('setAdminLambda', () => {
  const event = {
    body: JSON.stringify({
      userId: 'user456',
      admin: true,
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Test Admin',
      admin: true,
    })

    mockParseJSONWithFallback.mockReturnValue({
      userId: 'user456',
      admin: true,
    })

    mockRead.mockResolvedValue({
      id: 'user456',
      name: 'Test User',
      email: 'test@example.com',
      admin: false,
    })

    mockUpdate.mockResolvedValue({})
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 400 if userId is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      admin: true,
    })

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if trying to set own admin status', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      userId: 'user123', // Same as authorized user
      admin: false,
    })

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      id: 'user123',
      name: 'Test User',
      admin: false,
    })

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 404 if user is not found', async () => {
    mockRead.mockResolvedValueOnce(null)

    await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })
    expect(mockResponse).toHaveBeenCalledWith(404, 'Not found', event)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('grants admin privileges successfully', async () => {
    await setAdminLambda(event)

    // Verify user was retrieved
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })

    // Verify user was updated with admin privileges
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'user456' },
      {
        set: {
          admin: true,
          modifiedAt: expect.any(String),
          modifiedBy: 'Test Admin',
        },
      }
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        id: 'user456',
        name: 'Test User',
        email: 'test@example.com',
        admin: true,
        userId: 'user456',
      },
      event
    )
  })

  it('revokes admin privileges successfully', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      userId: 'user456',
      admin: false,
    })

    mockRead.mockResolvedValueOnce({
      id: 'user456',
      name: 'Test User',
      email: 'test@example.com',
      admin: true,
    })

    await setAdminLambda(event)

    // Verify user was retrieved
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })

    // Verify user was updated with admin privileges revoked
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'user456' },
      {
        set: {
          admin: false,
          modifiedAt: expect.any(String),
          modifiedBy: 'Test Admin',
        },
      }
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        id: 'user456',
        name: 'Test User',
        email: 'test@example.com',
        admin: false,
        userId: 'user456',
      },
      event
    )
  })

  it('preserves existing user fields when updating', async () => {
    mockRead.mockResolvedValueOnce({
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
