import { jest } from '@jest/globals'

const mockWsConnect = jest.fn<any>()
const mockBroadcastConnectionCounts = jest.fn<any>()

jest.unstable_mockModule('../lib/ws/connectionLifecycle', () => ({
  connectWebSocket: mockWsConnect,
}))

jest.unstable_mockModule('../lib/ws/actions', () => ({
  publishConnectionCounts: mockBroadcastConnectionCounts,
}))

const { default: wsConnectHandler } = await import('./handler')

describe('wsConnectHandler', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  const event = {
    requestContext: {
      connectionId: 'test-connection-id',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    mockWsConnect.mockResolvedValue(undefined)
    mockBroadcastConnectionCounts.mockResolvedValue(undefined)
  })

  afterAll(() => {
    errorSpy.mockRestore()
  })

  it('connects the websocket and broadcasts connection count', async () => {
    const result = await wsConnectHandler(event)

    // Verify wsConnect was called with the connection ID
    expect(mockWsConnect).toHaveBeenCalledWith({ connectionId: 'test-connection-id' })

    // Verify broadcastConnectionCount was called excluding current connection
    expect(mockBroadcastConnectionCounts).toHaveBeenCalledWith(['test-connection-id'])

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
    expect(mockWsConnect).toHaveBeenCalledWith({ connectionId: 'test-connection-id' })

    // Verify broadcastConnectionCount was not called
    expect(mockBroadcastConnectionCounts).not.toHaveBeenCalled()
  })

  it('throws an error if broadcastConnectionCount fails', async () => {
    // Setup broadcastConnectionCount to throw an error
    const error = new Error('Broadcast error')
    mockBroadcastConnectionCounts.mockRejectedValueOnce(error)

    // Expect the handler to throw the error
    await expect(wsConnectHandler(event)).rejects.toThrow('Broadcast error')

    // Verify wsConnect was called
    expect(mockWsConnect).toHaveBeenCalledWith({ connectionId: 'test-connection-id' })

    // Verify broadcastConnectionCount was called excluding current connection
    expect(mockBroadcastConnectionCounts).toHaveBeenCalledWith(['test-connection-id'])
  })

  it('ignores query token and connects anonymously', async () => {
    const result = await wsConnectHandler({ ...event, queryStringParameters: { token: 'ignored' } } as any)

    expect(result).toEqual({ body: 'Connected', statusCode: 200 })
    expect(mockWsConnect).toHaveBeenCalledWith({ connectionId: 'test-connection-id' })
  })
})
