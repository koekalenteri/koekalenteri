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

export const response = (
  statusCode: number,
  body: unknown,
  event: APIGatewayProxyEvent,
  contentType = 'application/json',
  extra: Partial<APIGatewayProxyResult> = {}
): APIGatewayProxyResult => ({
  ...extra,
  statusCode: statusCode,
  body: contentType === 'application/json' ? JSON.stringify(body) : (body as string),
  headers: {
    'Access-Control-Allow-Origin': allowOrigin(event),
    'Content-Type': contentType,
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
