import type { APIGatewayProxyEvent } from 'aws-lambda'

export const debugProxyEvent = (event: APIGatewayProxyEvent) => {
  try {
    console.debug('event.headers', event.headers)
    console.debug('event.queryStringParameters', event.queryStringParameters)
    console.debug('event.body', event.body)
  } catch (e) {
    console.error(e)
  }
}
