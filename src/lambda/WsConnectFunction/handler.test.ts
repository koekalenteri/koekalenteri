import { vi } from 'vitest'
import { LambdaError } from '../lib/lambda'

const mockWsConnect = vi.fn()

vi.doMock('../lib/ws/connectionLifecycle', () => ({
  connectWebSocket: mockWsConnect,
}))

const { default: wsConnectHandler } = await import('./handler')

describe('wsConnectHandler', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  const event = {
    requestContext: {
      connectionId: 'test-connection-id',
    },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()

    mockWsConnect.mockResolvedValue(undefined)
  })

  afterAll(() => {
    errorSpy.mockRestore()
  })

  it('connects the websocket', async () => {
    const result = await wsConnectHandler(event)

    expect(mockWsConnect).toHaveBeenCalledWith({ connectionId: 'test-connection-id' })

    expect(result).toEqual({
      body: 'Connected',
      statusCode: 200,
    })
  })

  it('throws an error if wsConnect fails', async () => {
    const error = new Error('Connection error')
    mockWsConnect.mockRejectedValueOnce(error)

    await expect(wsConnectHandler(event)).rejects.toThrow('Connection error')

    expect(mockWsConnect).toHaveBeenCalledWith({ connectionId: 'test-connection-id' })
  })

  it('returns LambdaError status if wsConnect rejects with LambdaError', async () => {
    mockWsConnect.mockRejectedValueOnce(new LambdaError(429, 'Too many public websocket connections'))

    const result = await wsConnectHandler(event)

    expect(result).toEqual({ body: 'Too many public websocket connections', statusCode: 429 })
  })

  it('returns 400 without a connection id', async () => {
    const result = await wsConnectHandler({ requestContext: {} } as any)

    expect(result).toEqual({ body: 'Bad request', statusCode: 400 })
    expect(mockWsConnect).not.toHaveBeenCalled()
  })

  it('ignores query token and connects anonymously', async () => {
    const result = await wsConnectHandler({ ...event, queryStringParameters: { token: 'ignored' } } as any)

    expect(result).toEqual({ body: 'Connected', statusCode: 200 })
    expect(mockWsConnect).toHaveBeenCalledWith({ connectionId: 'test-connection-id' })
  })
})
