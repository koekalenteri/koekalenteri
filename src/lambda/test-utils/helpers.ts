import type { APIGatewayProxyEvent, APIGatewayProxyEventPathParameters } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

interface Options {
  method?: 'OPTIONS' | 'HEAD' | 'GET' | 'PUT' | 'POST' | 'DELETE'
  headers?: Record<string, string>
  query?: Record<string, string>
  pathParameters?: APIGatewayProxyEventPathParameters | null
  path?: string
  username?: string
  rawBody?: string
}

const DEFAULT_OPTIONS = { method: 'GET' as const, headers: {}, query: {}, path: '/' }

export function constructAPIGwEvent<T = unknown>(message: T, options: Options = DEFAULT_OPTIONS): APIGatewayProxyEvent {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  return {
    httpMethod: opts.method,
    path: opts.path,
    queryStringParameters: opts.query,
    headers: opts.headers,
    body: opts.rawBody ?? JSON.stringify(message),
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    isBase64Encoded: false,
    pathParameters: opts.pathParameters || {},
    stageVariables: {},
    requestContext: {
      accountId: '',
      apiId: '',
      authorizer: {
        name: '',
        claims: {
          'cognito:username': options.username,
        },
      },
      protocol: 'http',
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
        user: '',
        userAgent: '',
        userArn: '',
        sourceIp: '',
      },
      path: opts.path,
      stage: '',
      requestId: '',
      requestTimeEpoch: 0,
      resourceId: '',
      resourcePath: opts.path,
    },
    resource: '',
  }
}

export function createAWSError(code: number, message: string): AWSError {
  return {
    name: 'Test Error',
    code: '' + code,
    statusCode: code,
    message: message,
    time: new Date(),
  }
}
