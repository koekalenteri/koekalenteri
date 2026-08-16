import type { APIGatewayProxyEvent } from 'aws-lambda'

export const debugProxyEvent = (event: APIGatewayProxyEvent) => {
  try {
    console.debug('request', {
      httpMethod: event.httpMethod,
      requestId: event.requestContext.requestId,
      resource: event.resource,
    })
  } catch {
    console.error('Failed to log request metadata')
  }
}
