import type { APIGatewayEvent, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { gzipSync } from 'node:zlib'
import { ServiceException } from '@smithy/smithy-client'
import { metricScope } from 'aws-embedded-metrics'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { debugProxyEvent, logger, withLogContext } from './log'
import { metricsError, metricsSuccess } from './metrics'

type LambdaHandler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>

export const isDevStage = () => CONFIG.stageName === 'dev'
export const isTestStage = () => CONFIG.stageName === 'test'
export const isProdStage = () => CONFIG.stageName === 'prod'

/**
 * A request's outcome that is not a success, thrown from wherever it is decided and turned into
 * the response by the `lambda` wrapper. `error` is the text the client gets as `{ error }` (or,
 * when it parses as JSON, as that object); `body`, when given, is the response body as is, so a
 * handler that used to `return response(4xx, body)` answers exactly the same after `throw`.
 */
export class LambdaError extends Error {
  status: number
  error: string | undefined
  body?: unknown

  constructor(status: number, error: string | undefined, body?: unknown) {
    const message = `${status} ${error}`
    super(message)
    this.status = status
    this.error = error
    this.body = body
  }
}

const bodyText = (body: unknown): string => {
  if (typeof body === 'string') return body
  if (body && typeof body === 'object') {
    const named = body as { error?: unknown; message?: unknown }
    if (typeof named.message === 'string') return named.message
    if (typeof named.error === 'string') return named.error
  }

  return JSON.stringify(body)
}

/**
 * A rejection whose body reaches the client as written: `httpError(401, 'Unauthorized')` answers
 * `"Unauthorized"`, and an object answers as that object (KOE-1342). Throw it where the request
 * turns out to be bad and let the wrapper answer; there is no need to carry the event around.
 */
export const httpError = (status: number, body: unknown) => new LambdaError(status, bodyText(body), body)

const lambdaErrorBody = (err: LambdaError) => {
  if (err.body !== undefined) return err.body
  if (!err.error) return { error: err.error }

  try {
    return JSON.parse(err.error)
  } catch {
    return { error: err.error }
  }
}

/**
 * A 4xx is the request's fault and the handler's answer, not a failure of ours: it gets a line at
 * info level, and only a 5xx thrown by us goes to the error log.
 */
const logRejection = (err: LambdaError) => {
  if (err.status < 500) logger.info('request rejected', { error: err.error, status: err.status })
  else logger.error('unhandled error', { error: err })
}

export const getParam = (
  event: Partial<Pick<APIGatewayProxyEvent, 'pathParameters'>>,
  name: string,
  defaultValue: string = ''
) => {
  try {
    return decodeURIComponent(event.pathParameters?.[name] ?? defaultValue)
  } catch (e) {
    logger.error('failed to decode path parameter', { error: e, param: name })
  }
  return defaultValue
}

export const isHttpMethod = (event: Partial<Pick<APIGatewayProxyEvent, 'httpMethod'>>, method: string): boolean =>
  event.httpMethod?.toUpperCase() === method.toUpperCase()

export const isPatchRequest = (event: Partial<Pick<APIGatewayProxyEvent, 'httpMethod'>>): boolean =>
  isHttpMethod(event, 'PATCH')

export const allowOrigin = (event: APIGatewayProxyEvent) => {
  const origin = getOrigin(event)
  // Exact host or a subdomain (dot boundary), https only. A bare endsWith would
  // also match unrelated hosts like evilkoekalenteri.snj.fi.
  if (origin?.startsWith('https://')) {
    const host = origin.slice('https://'.length)
    if (host === 'koekalenteri.snj.fi' || host.endsWith('.koekalenteri.snj.fi')) {
      return origin
    }
  }
  if (origin === 'http://localhost:3000' && isDevStage()) {
    return origin
  }
  return 'https://koekalenteri.snj.fi'
}

interface ResponseOptions {
  /**
   * Seconds a client may reuse this response. Omitted (the default) means no Cache-Control at
   * all, i.e. the response is revalidated every time. Only applied to successful responses.
   */
  maxAge?: number
  /** Restrict caching to the requesting browser. Required for anything behind authentication. */
  private?: boolean
}

export const response = <T = unknown>(
  statusCode: number,
  body: T,
  event: APIGatewayProxyEvent,
  { maxAge, private: isPrivate }: ResponseOptions = {}
): APIGatewayProxyResult => {
  const acceptEncoding = event.headers?.['Accept-Encoding'] ?? event.headers?.['accept-encoding'] ?? ''

  const result: APIGatewayProxyResult & { headers: NonNullable<APIGatewayProxyResult['headers']> } = {
    body: JSON.stringify(body),
    headers: {
      'Access-Control-Allow-Origin': allowOrigin(event),
      'Content-Type': 'application/json',
    },
    statusCode: statusCode,
  }

  if (maxAge && statusCode >= 200 && statusCode < 300) {
    result.headers['Cache-Control'] = `${isPrivate ? 'private' : 'public'}, max-age=${maxAge}`
    // Access-Control-Allow-Origin echoes the caller's origin and the body is conditionally
    // gzipped, so a cache that ignored these would hand out the wrong CORS header or encoding.
    result.headers.Vary = 'Origin, Accept-Encoding'
  }

  if (result.body && acceptEncoding.includes('gzip') && result.body.length > 4096) {
    result.isBase64Encoded = true
    result.body = gzipSync(result.body).toString('base64')
    result.headers['Content-Encoding'] = 'gzip'
  }

  return result
}

/**
 * Lambda function wrapper with error handling and default metrics
 */
export const lambda = (service: string, handler: LambdaHandler) =>
  metricScope(
    (metrics) =>
      async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
        // Every line the handler writes gets the request id and the service name, so one request's
        // lines can be collected in CloudWatch Insights without threading the context through calls.
        withLogContext({ requestId: event.requestContext?.requestId, service }, async () => {
          debugProxyEvent(event)
          try {
            const result = await handler(event)

            if (result.statusCode === 200) {
              metricsSuccess(metrics, event.requestContext, service)
            } else {
              metricsError(metrics, event.requestContext, service)
            }
            return result
          } catch (err) {
            metricsError(metrics, event.requestContext, service)

            if (err instanceof LambdaError) {
              logRejection(err)
              return response(err.status, lambdaErrorBody(err), event)
            }

            logger.error('unhandled error', { error: err })

            if (err instanceof ServiceException) {
              return response(err.$metadata?.httpStatusCode ?? 501, err.message, event)
            }

            return response(501, err, event)
          }
        })
  )

type WsHandler = (event: APIGatewayEvent) => Promise<APIGatewayProxyResult>

/**
 * The `lambda` wrapper's counterpart for the WebSocket route handlers: the same log context — with
 * the connection id, which collects one socket's whole life — the same metrics, and the same
 * `LambdaError` answered as a response. Before this the socket handlers wrapped themselves and
 * produced no metrics at all (KOE-1342).
 */
export const wsLambda = (service: string, handler: WsHandler) =>
  metricScope(
    (metrics) =>
      async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> =>
        withLogContext(
          { connectionId: event.requestContext.connectionId, requestId: event.requestContext.requestId, service },
          async () => {
            try {
              const result = await handler(event)

              if (result.statusCode === 200) {
                metricsSuccess(metrics, event.requestContext, service)
              } else {
                metricsError(metrics, event.requestContext, service)
              }
              return result
            } catch (err) {
              metricsError(metrics, event.requestContext, service)

              // A socket route's answer is read by API Gateway, not a browser: plain body, no CORS.
              if (err instanceof LambdaError) {
                logRejection(err)
                const body = err.body ?? err.error ?? 'Error'
                return { body: typeof body === 'string' ? body : JSON.stringify(body), statusCode: err.status }
              }

              logger.error('unhandled error', { error: err })
              return { body: 'Internal server error', statusCode: 500 }
            }
          }
        )
  )
