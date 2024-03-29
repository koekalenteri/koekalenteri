import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'
import { unescape } from 'querystring'

import { downloadFile } from '../lib/file'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { allowOrigin, response } from '../utils/response'

const getAttachmentHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const data = await downloadFile(unescape(event.pathParameters?.key ?? ''))

        if (!data.Body) {
          metricsError(metrics, event.requestContext, 'getAttachment')
          return response(404, 'not found', event)
        }

        metricsSuccess(metrics, event.requestContext, 'getAttachment')
        return {
          statusCode: 200,
          body: data.Body.toString('base64'),
          isBase64Encoded: true,
          headers: {
            'Access-Control-Allow-Origin': allowOrigin(event),
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${unescape(event.pathParameters?.name ?? 'kutsu.pdf')}"`,
          },
        }
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getAttachment')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getAttachmentHandler
