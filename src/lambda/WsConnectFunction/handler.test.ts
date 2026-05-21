import { jest } from '@jest/globals'

const mockWsConnect = jest.fn<any>()
const mockBroadcastConnectionCount = jest.fn<any>()
const mockAuthorizeWithMemberOf = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../lib/ws/connectionLifecycle', () => ({
  connectWebSocket: mockWsConnect,
}))

jest.unstable_mockModule('../lib/ws/actions', () => ({
  publishConnectionCount: mockBroadcastConnectionCount,
}))

const { default: wsConnectHandler } = await import('./handler')

describe('wsConnectHandler', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  const event = {
    requestContext: {
      authorizer: {
        claims: {
          exp: '2000000000',
        },
      },
      connectionId: 'test-connection-id',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org-1'],
      user: { admin: false, id: 'user-1' },
    })
    mockWsConnect.mockResolvedValue(undefined)
    mockBroadcastConnectionCount.mockResolvedValue(undefined)
  })

  afterAll(() => {
    errorSpy.mockRestore()
  })

  it('connects the websocket and broadcasts connection count', async () => {
    const result = await wsConnectHandler(event)

    // Verify wsConnect was called with the connection ID
    expect(mockWsConnect).toHaveBeenCalledWith({
      admin: false,
      connectionId: 'test-connection-id',
      expiresAt: 2000000000,
      memberOf: ['org-1'],
      userId: 'user-1',
    })

    // Verify broadcastConnectionCount was called
    expect(mockBroadcastConnectionCount).toHaveBeenCalled()

    // Verify the response
    expect(result).toEqual({
      body: 'Connected',
      statusCode: 200,
    })
  })

  it('throws an error if wsConnect fails', async () => {
    // Setup wsConnect to throw an error
    const error = new Error('Connection error')
    mockWsConnect.mockRejectedValueOnce(error)

    // Expect the handler to throw the error
    await expect(wsConnectHandler(event)).rejects.toThrow('Connection error')

    // Verify wsConnect was called
    expect(mockWsConnect).toHaveBeenCalledWith({
      admin: false,
      connectionId: 'test-connection-id',
      expiresAt: 2000000000,
      memberOf: ['org-1'],
      userId: 'user-1',
    })

    // Verify broadcastConnectionCount was not called
    expect(mockBroadcastConnectionCount).not.toHaveBeenCalled()
  })

  it('throws an error if broadcastConnectionCount fails', async () => {
    // Setup broadcastConnectionCount to throw an error
    const error = new Error('Broadcast error')
    mockBroadcastConnectionCount.mockRejectedValueOnce(error)

    // Expect the handler to throw the error
    await expect(wsConnectHandler(event)).rejects.toThrow('Broadcast error')

    // Verify wsConnect was called
    expect(mockWsConnect).toHaveBeenCalledWith({
      admin: false,
      connectionId: 'test-connection-id',
      expiresAt: 2000000000,
      memberOf: ['org-1'],
      userId: 'user-1',
    })

    // Verify broadcastConnectionCount was called
    expect(mockBroadcastConnectionCount).toHaveBeenCalled()
  })

  it('returns authorization response when user is not allowed to connect', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res: { body: 'Forbidden', statusCode: 403 } })

    const result = await wsConnectHandler(event)

    expect(result).toEqual({ body: 'Connected', statusCode: 200 })
    expect(mockWsConnect).toHaveBeenCalledWith({
      admin: undefined,
      connectionId: 'test-connection-id',
      expiresAt: 2000000000,
      memberOf: undefined,
      userId: undefined,
    })
    expect(mockBroadcastConnectionCount).toHaveBeenCalled()
  })

  it('connects anonymously if authorization throws', async () => {
    mockAuthorizeWithMemberOf.mockRejectedValueOnce(new Error('auth failed'))

    const result = await wsConnectHandler(event)

    expect(result).toEqual({ body: 'Connected', statusCode: 200 })
    expect(mockWsConnect).toHaveBeenCalledWith({
      admin: undefined,
      connectionId: 'test-connection-id',
      expiresAt: 2000000000,
      memberOf: undefined,
      userId: undefined,
    })
    expect(errorSpy).toHaveBeenCalledWith('ws connect auth failed', {
      connectionId: 'test-connection-id',
      message: 'auth failed',
    })
  })

  it('omits expiresAt when exp claim is not numeric', async () => {
    const invalidExpEvent = {
      requestContext: {
        authorizer: {
          claims: {
            exp: 'not-a-number',
          },
        },
        connectionId: 'test-connection-id',
      },
    } as any

    await wsConnectHandler(invalidExpEvent)

    expect(mockWsConnect).toHaveBeenCalledWith({
      admin: false,
      connectionId: 'test-connection-id',
      expiresAt: undefined,
      memberOf: ['org-1'],
      userId: 'user-1',
    })
  })
})
