import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonUser } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

import { debugProxyEvent } from './log'

export type LambdaHandler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
export type AdminLambdaHandler = (event: APIGatewayProxyEvent, user: JsonUser) => Promise<APIGatewayProxyResult>

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

      return response((err as AWSError).statusCode ?? 501, err, event)
    }
  })
