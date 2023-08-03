import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import { downloadFile } from '../lib/file'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

export const getAttachmentHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const data = await downloadFile(event.pathParameters?.key ?? '')
        metricsSuccess(metrics, event.requestContext, 'getAttachment')
        return response(200, data.Body, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getAttachment')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
