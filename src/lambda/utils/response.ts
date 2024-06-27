import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { gzipSync } from 'zlib'

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
): APIGatewayProxyResult => {
  const acceptEncoding = event.headers['Accept-Encoding'] ?? ''

  const result: APIGatewayProxyResult = {
    statusCode: statusCode,
    body: JSON.stringify(body),
    headers: {
      'Access-Control-Allow-Origin': allowOrigin(event),
      'Content-Type': 'application/json',
    },
  }

  if (acceptEncoding.includes('gzip') && result.body.length > 4096) {
    result.isBase64Encoded = true
    result.body = gzipSync(result.body).toString('base64')
    result.headers!['Content-Encoding'] = 'gzip'
  }

  return result
}
