import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getAdminEventsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const { user, memberOf, res } = await authorizeWithMemberOf(event)

        if (res) return res
        // @todo add index & use query to get relevant items
        const items = await dynamoDB.readAll<JsonDogEvent>()
        const allowed = items?.filter((item) => user.admin || memberOf.includes(item.organizer.id))

        metricsSuccess(metrics, event.requestContext, 'getAdminEvents')
        return response(200, allowed, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getAdminEvents')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getAdminEventsHandler
