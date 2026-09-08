import type { APIGatewayEvent, APIGatewayProxyEvent } from 'aws-lambda'
import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

vi.mock('../config', () => ({ CONFIG: { stageName: 'test' } }))
vi.mock('aws-embedded-metrics', () => ({
  metricScope: (factory: (metrics: unknown) => unknown) =>
    factory({ putDimensions: vi.fn(), putMetric: vi.fn(), setNamespace: vi.fn(), setProperty: vi.fn() }),
  Unit: { Count: 'Count' },
}))

const { httpError, lambda, LambdaError, wsLambda } = await import('./lambda')

const event = { headers: {}, requestContext: { requestId: 'req-1' } } as unknown as APIGatewayProxyEvent
const wsEvent = {
  headers: {},
  requestContext: { connectionId: 'conn-1', requestId: 'req-1' },
} as unknown as APIGatewayEvent

/**
 * The wrapper turns a thrown rejection into the response the client sees. What matters is that
 * the body a handler used to return is the body it now answers with (KOE-1342), and that a
 * rejected request is not logged as an error of ours.
 */
describe('lambda wrapper', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    errorSpy.mockRestore()
    infoSpy.mockRestore()
  })

  it('answers httpError with the body as written', async () => {
    const handler = lambda('test', async () => {
      throw httpError(401, 'Unauthorized')
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(401)
    expect(JSON.parse(result.body)).toBe('Unauthorized')
  })

  it('answers an httpError object body as that object', async () => {
    const handler = lambda('test', async () => {
      throw httpError(409, { error: 'staleData', message: 'Event has been modified since it was loaded' })
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(409)
    expect(JSON.parse(result.body)).toEqual({
      error: 'staleData',
      message: 'Event has been modified since it was loaded',
    })
  })

  it('keeps answering a bare LambdaError as { error }', async () => {
    const handler = lambda('test', async () => {
      throw new LambdaError(404, 'Event not found')
    })

    const result = await handler(event)

    expect(result.statusCode).toBe(404)
    expect(JSON.parse(result.body)).toEqual({ error: 'Event not found' })
  })

  it('logs a 4xx at info and a 5xx as an error', async () => {
    await lambda('test', async () => {
      throw httpError(403, 'Forbidden')
    })(event)

    expect(loggedLines(infoSpy)).toContainEqual(expect.objectContaining({ message: 'request rejected', status: 403 }))
    expect(errorSpy).not.toHaveBeenCalled()

    await lambda('test', async () => {
      throw new LambdaError(500, 'boom')
    })(event)

    expect(loggedLines(errorSpy)).toContainEqual(expect.objectContaining({ message: 'unhandled error' }))
  })
})

describe('wsLambda', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes a handler result through', async () => {
    const handler = wsLambda('ws', async () => ({ body: 'Connected', statusCode: 200 }))

    await expect(handler(wsEvent)).resolves.toEqual({ body: 'Connected', statusCode: 200 })
  })

  it('answers a rejection with a plain body: the reader is API Gateway, not a browser', async () => {
    const handler = wsLambda('ws', async () => {
      throw httpError(400, 'Bad request')
    })

    await expect(handler(wsEvent)).resolves.toEqual({ body: 'Bad request', statusCode: 400 })
  })

  it('answers 500 to anything else instead of failing the invocation', async () => {
    const handler = wsLambda('ws', async () => {
      throw new Error('boom')
    })

    await expect(handler(wsEvent)).resolves.toEqual({ body: 'Internal server error', statusCode: 500 })
  })
})
