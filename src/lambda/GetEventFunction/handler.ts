import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'
import { unescape } from 'querystring'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const id = unescape(event.pathParameters?.id ?? '')
        const item = await dynamoDB.read({ id })
        metricsSuccess(metrics, event.requestContext, 'getEvent')
        return response(200, item, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getEvent')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getEventHandler
