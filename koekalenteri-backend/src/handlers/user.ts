import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'

import { authorize } from '../utils/auth'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

export const getUserHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        metricsSuccess(metrics, event.requestContext, 'getUser')
        return response(200, user)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getUser')
        return response((err as AWSError).statusCode || 501, err)
      }
    }
)
