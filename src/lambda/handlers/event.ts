import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()

export const getEventsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const items = await dynamoDB.readAll()
        metricsSuccess(metrics, event.requestContext, 'getEvents')
        return response(200, items, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getEvents')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export const getEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const item = await dynamoDB.read(event.pathParameters)
        metricsSuccess(metrics, event.requestContext, 'getEvent')
        return response(200, item, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getEvent')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)
