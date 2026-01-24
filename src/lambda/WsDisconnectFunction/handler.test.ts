import { jest } from '@jest/globals'

const mockWsDisconnect = jest.fn<any>()
const mockBroadcastConnectionCount = jest.fn<any>()

jest.unstable_mockModule('../lib/broadcast', () => ({
  broadcastConnectionCount: mockBroadcastConnectionCount,
  wsDisconnect: mockWsDisconnect,
}))

const { default: wsDisconnectHandler } = await import('./handler')

describe('wsDisconnectHandler', () => {
  const event = {
    requestContext: {
      connectionId: 'test-connection-id',
    },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockWsDisconnect.mockResolvedValue(undefined)
    mockBroadcastConnectionCount.mockResolvedValue(undefined)
  })

  it('disconnects the websocket and broadcasts connection count', async () => {
    const result = await wsDisconnectHandler(event)

    // Verify wsDisconnect was called with the connection ID
    expect(mockWsDisconnect).toHaveBeenCalledWith('test-connection-id')

    // Verify broadcastConnectionCount was called
    expect(mockBroadcastConnectionCount).toHaveBeenCalled()

    // Verify the response
    expect(result).toEqual({
      body: 'Disonnected', // Note: This matches the typo in the original handler
      statusCode: 200,
    })
  })

  it('throws an error if wsDisconnect fails', async () => {
    // Setup wsDisconnect to throw an error
    const error = new Error('Disconnection error')
    mockWsDisconnect.mockRejectedValueOnce(error)

    // Expect the handler to throw the error
    await expect(wsDisconnectHandler(event)).rejects.toThrow('Disconnection error')

    // Verify wsDisconnect was called
    expect(mockWsDisconnect).toHaveBeenCalledWith('test-connection-id')

    // Verify broadcastConnectionCount was not called
    expect(mockBroadcastConnectionCount).not.toHaveBeenCalled()
  })

  it('throws an error if broadcastConnectionCount fails', async () => {
    // Setup broadcastConnectionCount to throw an error
    const error = new Error('Broadcast error')
    mockBroadcastConnectionCount.mockRejectedValueOnce(error)

    // Expect the handler to throw the error
    await expect(wsDisconnectHandler(event)).rejects.toThrow('Broadcast error')

    // Verify wsDisconnect was called
    expect(mockWsDisconnect).toHaveBeenCalledWith('test-connection-id')

    // Verify broadcastConnectionCount was called
    expect(mockBroadcastConnectionCount).toHaveBeenCalled()
  })
})
