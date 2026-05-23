import { jest } from '@jest/globals'

const mockSubscribeToAdmin = jest.fn<any>()
const mockSubscribeToEvent = jest.fn<any>()
const mockUnsubscribeFromAdmin = jest.fn<any>()
const mockUnsubscribeFromEvent = jest.fn<any>()
const mockGetWsConnection = jest.fn<any>()
const mockResponse = jest.fn<any>()

jest.unstable_mockModule('../lib/ws/connectionLifecycle', () => ({
  getWebSocketConnection: mockGetWsConnection,
}))

jest.unstable_mockModule('../lib/ws/actions', () => ({
  subscribeWebSocketToAdmin: mockSubscribeToAdmin,
  subscribeWebSocketToEvent: mockSubscribeToEvent,
  unsubscribeWebSocketFromAdmin: mockUnsubscribeFromAdmin,
  unsubscribeWebSocketFromEvent: mockUnsubscribeFromEvent,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  response: mockResponse,
}))

const { default: wsMessageHandler } = await import('./handler')

describe('wsMessageHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockResponse.mockImplementation((statusCode: number, body: unknown) => ({ body, statusCode }))
  })

  it('returns 400 when connectionId is missing', async () => {
    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'admin' }),
      requestContext: {},
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
  })

  it('returns 400 when body is missing', async () => {
    // handler exits before calling getWebSocketConnection — no mock needed
    const result = await wsMessageHandler({
      body: null,
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
  })

  it('returns 400 when connection is not found', async () => {
    mockGetWsConnection.mockResolvedValueOnce(undefined)

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'admin' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
  })

  it('subscribes to admin channel', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ admin: true, connectionId: 'conn-1' })
    mockSubscribeToAdmin.mockResolvedValueOnce({ adminSubscribed: true })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'admin' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(mockSubscribeToAdmin).toHaveBeenCalledWith({ admin: true, connectionId: 'conn-1' })
    expect(result).toEqual({ body: { adminSubscribed: true }, statusCode: 200 })
  })

  it('subscribes to an event channel', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ admin: false, connectionId: 'conn-1', memberOf: ['org-1'] })
    mockSubscribeToEvent.mockResolvedValueOnce({ eventId: 'event-1', subscribed: true })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'event', eventId: 'event-1' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(mockSubscribeToEvent).toHaveBeenCalledWith(
      { admin: false, connectionId: 'conn-1', memberOf: ['org-1'] },
      'event-1'
    )
    expect(result).toEqual({ body: { eventId: 'event-1', subscribed: true }, statusCode: 200 })
  })

  it('returns 400 when subscribing to event without eventId', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ connectionId: 'conn-1' })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'event' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
  })

  it('returns 400 when subscribing with unknown channel', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ connectionId: 'conn-1' })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'unknown' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
  })

  it('unsubscribes from admin channel', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ admin: true, adminSubscribed: true, connectionId: 'conn-1' })
    mockUnsubscribeFromAdmin.mockResolvedValueOnce({ adminSubscribed: false })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'unsubscribe', channel: 'admin' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(mockUnsubscribeFromAdmin).toHaveBeenCalledWith('conn-1')
    expect(result).toEqual({ body: { adminSubscribed: false, connectionId: 'conn-1' }, statusCode: 200 })
  })

  it('unsubscribes from event channel', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ connectionId: 'conn-1', eventId: 'event-1' })
    mockUnsubscribeFromEvent.mockResolvedValueOnce(undefined)

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'unsubscribe', channel: 'event' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith('conn-1')
    expect(result).toEqual({ body: { connectionId: 'conn-1', unsubscribed: true }, statusCode: 200 })
  })

  it('returns 400 when unsubscribing from event without eventId set', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ connectionId: 'conn-1' })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'unsubscribe', channel: 'event' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
  })

  it('returns 400 when unsubscribing with unknown channel', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ connectionId: 'conn-1' })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'unsubscribe', channel: 'unknown' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
  })
})
