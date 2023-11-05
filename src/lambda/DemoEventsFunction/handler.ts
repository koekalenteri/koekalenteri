import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

import { events } from './demo-events'

const dynamoDB = new CustomDynamoClient()

const demoEvents = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      if (process.env.STAGE_NAME !== 'dev') {
        return response(401, 'Unauthorized', event)
      }

      try {
        await dynamoDB.batchWrite(events)

        metricsSuccess(metrics, event.requestContext, 'demoEvents')
        return response(200, 'ok', event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'demoEvents')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default demoEvents
