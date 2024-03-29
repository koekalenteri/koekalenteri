import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)

const getTemplatesHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const items = await dynamoDB.readAll()
        metricsSuccess(metrics, event.requestContext, 'getTemplates')
        return response(200, items, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getTemplates')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getTemplatesHandler
