import type { APIGatewayEvent, APIGatewayProxyEvent } from 'aws-lambda'
import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

vi.mock('../config', () => ({ CONFIG: { stageName: 'test' } }))
// The backend project runs the metric sink as Local (vitest.config.mts), which writes each EMF line
// with console.log; the deployed Lambda writes the same line to stdout for CloudWatch to read.

const { MetricsLogger } = await import('aws-embedded-metrics')
const { lambda, LambdaError, response, wsLambda } = await import('./lambda')

const event = { headers: {}, requestContext: { requestId: 'req-1' } } as unknown as APIGatewayProxyEvent
const wsEvent = {
  headers: {},
  requestContext: { connectionId: 'conn-1', requestId: 'req-1' },
} as unknown as APIGatewayEvent

/**
 * Every metric the wrapper writes is a custom CloudWatch metric the account pays for per month. A
 * successful request is already counted by AWS/Lambda Invocations for free, so the wrapper writes
 * nothing for it; a failed one is counted as `Error`, which Lambda's own Errors does not see when the
 * handler answers the failure instead of throwing it (KOE-1602).
 */
describe('lambda wrapper metrics', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** One EMF line counting one `Error` of the service in the KoekalenteriApp namespace. */
  const errorLine = (service: string) =>
    expect.objectContaining({
      _aws: expect.objectContaining({
        CloudWatchMetrics: [
          expect.objectContaining({ Metrics: [{ Name: 'Error', Unit: 'Count' }], Namespace: 'KoekalenteriApp' }),
        ],
      }),
      Error: 1,
      RequestId: 'req-1',
      Service: service,
    })

  it('writes no metric for a request answered 200', async () => {
    await lambda('test', async (e) => response(200, { ok: true }, e))(event)

    expect(loggedLines(logSpy)).toEqual([])
  })

  it('writes no metric for a socket route answered 200', async () => {
    await wsLambda('ws', async () => ({ body: 'Connected', statusCode: 200 }))(wsEvent)

    expect(loggedLines(logSpy)).toEqual([])
  })

  it('counts a failed request as an Error of its service', async () => {
    await lambda('test', async () => {
      throw new LambdaError(500, 'boom')
    })(event)

    expect(loggedLines(logSpy)).toEqual([errorLine('test')])
  })

  it('counts a failed socket route as an Error of its service', async () => {
    await wsLambda('ws', async () => {
      throw new Error('boom')
    })(wsEvent)

    expect(loggedLines(logSpy)).toEqual([errorLine('ws')])
  })

  // Any answer but a 200 is an Error, also one the handler returns rather than throws.
  it('counts a request answered anything but 200 as an Error', async () => {
    await lambda('test', async (e) => response(304, '', e))(event)
    await wsLambda('ws', async () => ({ body: 'Gone', statusCode: 410 }))(wsEvent)

    expect(loggedLines(logSpy)).toEqual([errorLine('test'), errorLine('ws')])
  })

  it('answers as before when the metric cannot be written', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(MetricsLogger.prototype, 'flush').mockRejectedValueOnce(new Error('sink down'))

    const result = await lambda('test', async () => {
      throw new LambdaError(500, 'boom')
    })(event)

    expect(result.statusCode).toBe(500)
    expect(loggedLines(warnSpy)).toEqual([expect.objectContaining({ message: 'error metric not written' })])
  })
})
