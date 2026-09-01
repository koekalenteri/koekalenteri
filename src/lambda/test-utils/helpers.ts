import type { APIGatewayProxyEvent, APIGatewayProxyEventPathParameters } from 'aws-lambda'
import type { DeepPartial, JsonConfirmedEvent, JsonRegistration } from '../../types'

interface Options {
  method?: 'OPTIONS' | 'HEAD' | 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  query?: Record<string, string>
  pathParameters?: APIGatewayProxyEventPathParameters | null
  path?: string
  username?: string
  rawBody?: string
}

const DEFAULT_OPTIONS = { headers: {}, method: 'GET' as const, path: '/', query: {} }

export function constructAPIGwEvent<T = unknown>(message: T, options: Options = DEFAULT_OPTIONS): APIGatewayProxyEvent {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  return {
    body: opts.rawBody ?? JSON.stringify(message),
    headers: opts.headers,
    httpMethod: opts.method,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    path: opts.path,
    pathParameters: opts.pathParameters || {},
    queryStringParameters: opts.query,
    requestContext: {
      accountId: '',
      apiId: '',
      authorizer: {
        claims: {
          'cognito:username': options.username,
        },
        name: '',
      },
      httpMethod: opts.method,
      identity: {
        accessKey: '',
        accountId: '',
        apiKey: '',
        apiKeyId: '',
        caller: '',
        clientCert: null,
        cognitoAuthenticationProvider: '',
        cognitoAuthenticationType: '',
        cognitoIdentityId: '',
        cognitoIdentityPoolId: '',
        principalOrgId: '',
        sourceIp: '',
        user: '',
        userAgent: '',
        userArn: '',
      },
      path: opts.path,
      protocol: 'http',
      requestId: '',
      requestTimeEpoch: 0,
      resourceId: '',
      resourcePath: opts.path,
      stage: '',
    },
    resource: '',
    stageVariables: {},
  }
}

/**
 * Handlers under test read only a few fields of the API Gateway event, and many tests build
 * deliberately partial events (a missing body or path parameter is often the scenario itself).
 * Such a partial event converts to the full type at this one shared, named boundary.
 */
export const constructPartialAPIGwEvent = (
  event: Partial<Omit<APIGatewayProxyEvent, 'requestContext'>> & {
    requestContext?: Partial<APIGatewayProxyEvent['requestContext']>
  }
): APIGatewayProxyEvent => event as APIGatewayProxyEvent

/**
 * Many tests feed deliberately minimal events and registrations, where the code under test reads
 * only the fields the fixture carries; the deep-partial fixtures convert to the full json shapes
 * at these shared, named boundaries.
 */
export const asJsonConfirmedEvent = (event: DeepPartial<JsonConfirmedEvent>) => event as JsonConfirmedEvent
export const asJsonRegistration = (reg: DeepPartial<JsonRegistration>) => reg as JsonRegistration
