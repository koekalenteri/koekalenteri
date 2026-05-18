import { jest } from '@jest/globals'

const mockSubscribe = jest.fn<any>()
const mockUnsubscribe = jest.fn<any>()
const mockGetWsConnection = jest.fn<any>()

jest.unstable_mockModule('../ws/broadcastService', () => ({
  getWebSocketConnection: mockGetWsConnection,
  subscribeWebSocketToEvent: mockSubscribe,
  unsubscribeWebSocketFromEvent: mockUnsubscribe,
}))

const { wsMessageHandler } = await import('./handler')

describe('wsMessageHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('subscribes to an event', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ admin: false, connectionId: 'conn-1', memberOf: ['org-1'] })
    mockSubscribe.mockResolvedValueOnce({ eventId: 'event-1', subscribed: true })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', eventId: 'event-1' }),
      headers: {},
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(mockGetWsConnection).toHaveBeenCalledWith('conn-1')
    expect(mockSubscribe).toHaveBeenCalledWith({ admin: false, connectionId: 'conn-1', memberOf: ['org-1'] }, 'event-1')
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ eventId: 'event-1', subscribed: true })
  })

  it('unsubscribes from an event', async () => {
    mockUnsubscribe.mockResolvedValueOnce(undefined)

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'unsubscribe' }),
      headers: {},
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(mockUnsubscribe).toHaveBeenCalledWith('conn-1')
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ connectionId: 'conn-1', unsubscribed: true })
  })
})
