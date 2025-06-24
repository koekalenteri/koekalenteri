import { jest } from '@jest/globals'

const mockWsConnect = jest.fn<any>()
const mockBroadcastConnectionCount = jest.fn<any>()

jest.unstable_mockModule('../lib/broadcast', () => ({
  wsConnect: mockWsConnect,
  broadcastConnectionCount: mockBroadcastConnectionCount,
}))

const { default: wsConnectHandler } = await import('./handler')

describe('wsConnectHandler', () => {
  const event = {
    requestContext: {
      connectionId: 'test-connection-id',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockWsConnect.mockResolvedValue(undefined)
    mockBroadcastConnectionCount.mockResolvedValue(undefined)
  })

  it('connects the websocket and broadcasts connection count', async () => {
    const result = await wsConnectHandler(event)

    // Verify wsConnect was called with the connection ID
    expect(mockWsConnect).toHaveBeenCalledWith('test-connection-id')

    // Verify broadcastConnectionCount was called
    expect(mockBroadcastConnectionCount).toHaveBeenCalled()

    // Verify the response
    expect(result).toEqual({
      statusCode: 200,
      body: 'Connected',
    })
  })

  it('throws an error if wsConnect fails', async () => {
    // Setup wsConnect to throw an error
    const error = new Error('Connection error')
    mockWsConnect.mockRejectedValueOnce(error)

    // Expect the handler to throw the error
    await expect(wsConnectHandler(event)).rejects.toThrow('Connection error')

    // Verify wsConnect was called
    expect(mockWsConnect).toHaveBeenCalledWith('test-connection-id')

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
    expect(mockWsConnect).toHaveBeenCalledWith('test-connection-id')

    // Verify broadcastConnectionCount was called
    expect(mockBroadcastConnectionCount).toHaveBeenCalled()
  })
})
