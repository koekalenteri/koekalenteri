import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { ServiceException } from '@smithy/smithy-client'
import { metricScope } from 'aws-embedded-metrics'
import { gzipSync } from 'zlib'

import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'

import { debugProxyEvent } from './log'
import { metricsError, metricsSuccess } from './metrics'

type LambdaHandler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>

export const isDevStage = () => CONFIG.stageName === 'dev'
export const isTestStage = () => CONFIG.stageName === 'test'
export const isProdStage = () => CONFIG.stageName === 'prod'

export class LambdaError extends Error {
  status: number
  error: string | undefined

  constructor(status: number, error: string | undefined) {
    const message = `${status} ${error}`
    super(message)
    this.status = status
    this.error = error
  }
}

export const getParam = (
  event: Partial<Pick<APIGatewayProxyEvent, 'pathParameters'>>,
  name: string,
  defaultValue: string = ''
) => {
  try {
    return decodeURIComponent(event.pathParameters?.[name] ?? defaultValue)
  } catch (e) {
    console.error(e)
  }
  return defaultValue
}

export const allowOrigin = (event: APIGatewayProxyEvent) => {
  const origin = getOrigin(event)
  if (origin?.endsWith('koekalenteri.snj.fi')) {
    return origin
  }
  if (origin === 'http://localhost:3000' && isDevStage()) {
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

  if (result.body && acceptEncoding.includes('gzip') && result.body.length > 4096) {
    result.isBase64Encoded = true
    result.body = gzipSync(result.body).toString('base64')
    result.headers!['Content-Encoding'] = 'gzip'
  }

  return result
}

/**
 * Lambda function wrapper with error handling and default metrics
 */
export const lambda = (service: string, handler: LambdaHandler) =>
  metricScope((metrics) => async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    debugProxyEvent(event)
    try {
      const result = await handler(event)

      if (result.statusCode === 200) {
        metricsSuccess(metrics, event.requestContext, service)
      } else {
        metricsError(metrics, event.requestContext, service)
      }
      return result
    } catch (err) {
      console.error(err)

      metricsError(metrics, event.requestContext, service)

      if (err instanceof LambdaError) {
        return response(err.status, { error: err.error }, event)
      }

      if (err instanceof ServiceException) {
        return response(err.$metadata?.httpStatusCode ?? 501, err.message, event)
      }

      return response(501, err, event)
    }
  })
