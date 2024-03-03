import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { sanitizeDogEvent } from '../../lib/event'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getEventsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const items = await dynamoDB.readAll<JsonDogEvent>()
        const publicItems = items?.filter((item) => item.state !== 'draft').map((item) => sanitizeDogEvent(item))

        metricsSuccess(metrics, event.requestContext, 'getEvents')
        return response(200, publicItems, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getEvents')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getEventsHandler
