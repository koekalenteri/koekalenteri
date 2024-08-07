import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

import { debugProxyEvent } from './log'

export type LambdaHandler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>

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
      if (err instanceof Error) {
        console.error(err.message)
      }
      metricsError(metrics, event.requestContext, service)
      return response((err as AWSError).statusCode ?? 501, err, event)
    }
  })
