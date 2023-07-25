import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { getOrigin } from './auth'

const allowOrigin = (event: APIGatewayProxyEvent) => {
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

export const response = (statusCode: number, body: unknown, event: APIGatewayProxyEvent): APIGatewayProxyResult => ({
  statusCode: statusCode,
  body: JSON.stringify(body),
  headers: {
    'Access-Control-Allow-Origin': allowOrigin(event),
    'Content-Type': 'application/json',
  },
})

export const redirect = (body: unknown, url: string): APIGatewayProxyResult => ({
  statusCode: 302,
  body: JSON.stringify(body),
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    Location: url,
  },
})
