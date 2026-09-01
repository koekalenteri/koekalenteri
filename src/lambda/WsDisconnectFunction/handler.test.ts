import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockWsDisconnect = vi.fn()
const mockPublishEventViewers = vi.fn()

vi.doMock('../lib/ws/connectionLifecycle', () => ({
  disconnectWebSocket: mockWsDisconnect,
}))

vi.doMock('../lib/ws/actions', () => ({
  publishEventViewers: mockPublishEventViewers,
}))

const { default: wsDisconnectHandler } = await import('./handler')

describe('wsDisconnectHandler', () => {
  const event = constructPartialAPIGwEvent({
    requestContext: {
      connectionId: 'test-connection-id',
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()

    mockWsDisconnect.mockResolvedValue(undefined)
    mockPublishEventViewers.mockResolvedValue(undefined)
  })

  it('disconnects the websocket', async () => {
    const result = await wsDisconnectHandler(event)

    expect(mockWsDisconnect).toHaveBeenCalledWith(
      'test-connection-id',
      expect.objectContaining({ notifyEventViewers: expect.any(Function) })
    )

    expect(result).toEqual({
      body: 'Disconnected',
      statusCode: 200,
    })
  })

  it('notifies the viewers of the event the connection was watching', async () => {
    mockWsDisconnect.mockImplementationOnce(async (_id: string, { notifyEventViewers }: any) => {
      await notifyEventViewers('e1', 'org1')
    })

    await wsDisconnectHandler(event)

    expect(mockPublishEventViewers).toHaveBeenCalledWith('e1', 'org1')
  })

  it('throws an error if wsDisconnect fails', async () => {
    const error = new Error('Disconnection error')
    mockWsDisconnect.mockRejectedValueOnce(error)

    await expect(wsDisconnectHandler(event)).rejects.toThrow('Disconnection error')

    expect(mockWsDisconnect).toHaveBeenCalledWith(
      'test-connection-id',
      expect.objectContaining({ notifyEventViewers: expect.any(Function) })
    )
  })

  it('returns 400 without a connection id', async () => {
    const result = await wsDisconnectHandler(constructPartialAPIGwEvent({ requestContext: {} }))

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
    expect(mockWsDisconnect).not.toHaveBeenCalled()
  })
})
