import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import { authorize } from '../lib/auth'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const getUserHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event, true)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }
        metricsSuccess(metrics, event.requestContext, 'getUser')
        return response(200, user, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getUser')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getUserHandler
