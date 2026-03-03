import type { APIGatewayProxyEvent, APIGatewayProxyEventPathParameters } from 'aws-lambda'

interface Options {
  method?: 'OPTIONS' | 'HEAD' | 'GET' | 'PUT' | 'POST' | 'DELETE'
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
