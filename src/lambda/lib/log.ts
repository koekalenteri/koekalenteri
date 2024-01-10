import type { APIGatewayProxyEvent } from 'aws-lambda'

export const debugProxyEvent = (apiEvent: APIGatewayProxyEvent) => {
  try {
    console.log('event.headers', apiEvent.headers)
    console.log('event.queryStringParameters', apiEvent.queryStringParameters)
    console.log('event.multivalueHeaders', apiEvent.multiValueHeaders)
    console.log('event.multiValueQueryStringParameters', apiEvent.multiValueQueryStringParameters)
    console.log('event.body', apiEvent.body)
  } catch (e) {
    console.error(e)
  }
}
