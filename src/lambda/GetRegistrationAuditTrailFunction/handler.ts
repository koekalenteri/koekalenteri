import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'
import { unescape } from 'querystring'

import { auditTrail } from '../lib/audit'
import { authorize } from '../utils/auth'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const getAuditTrailHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }
        const eventId = unescape(event.pathParameters?.eventId ?? '')
        const id = unescape(event.pathParameters?.id ?? '')
        const trail = await auditTrail(`${eventId}:${id}`)
        metricsSuccess(metrics, event.requestContext, 'getAuditTrail')
        return response(200, trail, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getAuditTrail')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getAuditTrailHandler
