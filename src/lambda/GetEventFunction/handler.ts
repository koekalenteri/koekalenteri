import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { sanitizeDogEvent } from '../../lib/event'
import { CONFIG } from '../config'
import { getParam } from '../lib/apigw'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const id = getParam(event, 'id')
        const item = await dynamoDB.read<JsonDogEvent>({ id })
        const publicEvent = item && sanitizeDogEvent(item)

        metricsSuccess(metrics, event.requestContext, 'getEvent')
        return response(200, publicEvent, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getEvent')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getEventHandler
