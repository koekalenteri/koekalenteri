import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockParseJSONWithFallback = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockUpdate = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
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

const { setAdminLambda } = await import('./handler')

describe('setAdminLambda', () => {
  const event = {
    body: JSON.stringify({
      admin: true,
      userId: 'user456',
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Test Admin',
    })

    mockParseJSONWithFallback.mockReturnValue({
      admin: true,
      userId: 'user456',
    })

    mockRead.mockResolvedValue({
      admin: false,
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
    })

    mockUpdate.mockResolvedValue({})
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 400 if userId is missing', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      admin: true,
    })

    const result = await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(result.statusCode).toBe(400)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if trying to set own admin status', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      admin: false,
      userId: 'user123', // Same as authorized user
    })

    const result = await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(result.statusCode).toBe(403)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 403 if not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test User',
    })

    const result = await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(result.statusCode).toBe(403)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('returns 404 if user is not found', async () => {
    mockRead.mockResolvedValueOnce(null)

    const result = await setAdminLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockParseJSONWithFallback).toHaveBeenCalledWith(event.body)
    expect(mockRead).toHaveBeenCalledWith({ id: 'user456' })
    expect(result.statusCode).toBe(404)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('grants admin privileges successfully', async () => {
    const result = await setAdminLambda(event)

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
    expect(result.statusCode).toBe(200)
  })

  it('revokes admin privileges successfully', async () => {
    mockParseJSONWithFallback.mockReturnValueOnce({
      admin: false,
      userId: 'user456',
    })

    mockRead.mockResolvedValueOnce({
      admin: true,
      email: 'test@example.com',
      id: 'user456',
      name: 'Test User',
    })

    const result = await setAdminLambda(event)

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
    expect(result.statusCode).toBe(200)
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

    const result = await setAdminLambda(event)

    expect(result.statusCode).toBe(200)
  })
})
