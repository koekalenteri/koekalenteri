import { APIGatewayProxyEvent, SQSEvent } from "aws-lambda";

const DEFAULT_OPTIONS = { method: "GET", headers: {}, query: {}, path: "/" }

export function constructAPIGwEvent(message: any, options: any = DEFAULT_OPTIONS): APIGatewayProxyEvent {
  const opts = Object.assign({}, DEFAULT_OPTIONS, options);
  return {
    httpMethod: opts.method,
    path: opts.path,
    queryStringParameters: opts.query,
    headers: opts.headers,
    body: opts.rawBody || JSON.stringify(message),
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    isBase64Encoded: false,
    pathParameters: opts.pathParameters || {},
    stageVariables: {},
    requestContext: {
      accountId: '',
      apiId: '',
      authorizer: { name: '' },
      protocol: 'http',
      httpMethod: opts.method,
      identity: { 
        accessKey: '',
        accountId: '',
        apiKey: '',
        apiKeyId: '',
        caller: '',
        cognitoAuthenticationProvider: '',
        cognitoAuthenticationType: '',
        cognitoIdentityId: '',
        cognitoIdentityPoolId: '',
        principalOrgId: '',
        user: '',
        userAgent: '',
        userArn: '',
        sourceIp: '' 
      },
      path: opts.path,
      stage: '',
      requestId: '',
      requestTimeEpoch: 0,
      resourceId: '',
      resourcePath: opts.path
    },
    resource: '',
  }
}
