import { jest } from '@jest/globals'
import { LambdaError } from '../lib/lambda'

const mockSubscribeToAdmin = jest.fn<any>()
const mockSubscribeToEvent = jest.fn<any>()
const mockUnsubscribeFromAdmin = jest.fn<any>()
const mockUnsubscribeFromEvent = jest.fn<any>()
const mockGetWsConnection = jest.fn<any>()
const mockAuthenticateToken = jest.fn<any>()
const mockAuthenticateWebSocket = jest.fn<any>()
const mockResponse = jest.fn<any>()

jest.unstable_mockModule('../lib/ws/connectionLifecycle', () => ({
  authenticateWebSocket: mockAuthenticateWebSocket,
  getWebSocketConnection: mockGetWsConnection,
}))

jest.unstable_mockModule('../lib/ws/authentication', () => ({
  authenticateWebSocketToken: mockAuthenticateToken,
}))

jest.unstable_mockModule('../lib/ws/actions', () => ({
  subscribeWebSocketToAdmin: mockSubscribeToAdmin,
  subscribeWebSocketToEvent: mockSubscribeToEvent,
  unsubscribeWebSocketFromAdmin: mockUnsubscribeFromAdmin,
  unsubscribeWebSocketFromEvent: mockUnsubscribeFromEvent,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  LambdaError,
  response: mockResponse,
}))

const { default: wsMessageHandler } = await import('./handler')

describe('wsMessageHandler', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeEach(() => {
    jest.resetAllMocks()
    mockResponse.mockImplementation((statusCode: number, body: unknown) => ({ body, statusCode }))
  })

  afterAll(() => {
    errorSpy.mockRestore()
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

  it('returns 400 when message action is unknown', async () => {
    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'ping' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
    expect(mockGetWsConnection).not.toHaveBeenCalled()
  })

  it('returns 400 when eventId is only whitespace', async () => {
    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'event', eventId: '   ' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
    expect(mockGetWsConnection).not.toHaveBeenCalled()
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

  it('authenticates a websocket connection', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ connectionId: 'conn-1' })
    mockAuthenticateToken.mockResolvedValueOnce({
      admin: false,
      expiresAt: 2000000000,
      memberOf: ['org-1'],
      userEmail: 'viewer@example.com',
      userId: 'user-1',
      userName: 'Viewer Name',
    })
    mockAuthenticateWebSocket.mockResolvedValueOnce(undefined)

    const event = {
      body: JSON.stringify({ action: 'authenticate', token: 'id-token' }),
      requestContext: { connectionId: 'conn-1' },
    } as any
    const result = await wsMessageHandler(event)

    expect(mockAuthenticateToken).toHaveBeenCalledWith(event, 'id-token')
    expect(mockAuthenticateWebSocket).toHaveBeenCalledWith({
      admin: false,
      connectionId: 'conn-1',
      expiresAt: 2000000000,
      memberOf: ['org-1'],
      userEmail: 'viewer@example.com',
      userId: 'user-1',
      userName: 'Viewer Name',
    })
    expect(result).toEqual({
      body: {
        admin: false,
        authenticated: true,
        expiresAt: 2000000000,
        memberOf: ['org-1'],
        userEmail: 'viewer@example.com',
        userId: 'user-1',
        userName: 'Viewer Name',
      },
      statusCode: 200,
    })
  })

  it('returns 400 when authenticate token is missing', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ connectionId: 'conn-1' })

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'authenticate' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
    expect(mockAuthenticateToken).not.toHaveBeenCalled()
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

    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith({ connectionId: 'conn-1', eventId: 'event-1' })
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

  it('returns LambdaError status when subscribeWebSocketToAdmin throws LambdaError', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ admin: false, connectionId: 'conn-1', memberOf: [] })
    mockSubscribeToAdmin.mockRejectedValueOnce(new LambdaError(403, 'Forbidden'))

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'admin' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: { error: 'Forbidden', ok: false, status: 403 }, statusCode: 403 })
  })

  it('returns LambdaError status when subscribeWebSocketToEvent throws LambdaError', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ admin: false, connectionId: 'conn-1', memberOf: [] })
    mockSubscribeToEvent.mockRejectedValueOnce(new LambdaError(403, 'Forbidden'))

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'event', eventId: 'event-1' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: { error: 'Forbidden', ok: false, status: 403 }, statusCode: 403 })
  })

  it('returns 500 when an unexpected error is thrown', async () => {
    mockGetWsConnection.mockResolvedValueOnce({ admin: true, connectionId: 'conn-1' })
    mockSubscribeToAdmin.mockRejectedValueOnce(new Error('unexpected'))

    const result = await wsMessageHandler({
      body: JSON.stringify({ action: 'subscribe', channel: 'admin' }),
      requestContext: { connectionId: 'conn-1' },
    } as any)

    expect(result).toEqual({ body: { error: 'Internal server error', ok: false, status: 500 }, statusCode: 500 })
  })
})
