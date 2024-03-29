import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { getOrigin } from '../lib/auth'

export const allowOrigin = (event: APIGatewayProxyEvent) => {
  const origin = getOrigin(event)
  if (origin?.endsWith('koekalenteri.snj.fi')) {
    return origin
  }
  // TODO: remove localhost access
  if (origin === 'http://localhost:3000') {
    return origin
  }
  return 'https://koekalenteri.snj.fi'
}

export const response = <T = unknown>(
  statusCode: number,
  body: T,
  event: APIGatewayProxyEvent
): APIGatewayProxyResult => ({
  statusCode: statusCode,
  body: JSON.stringify(body),
  headers: {
    'Access-Control-Allow-Origin': allowOrigin(event),
    'Content-Type': 'application/json',
  },
})
