import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { getParam } from '../lib/apigw'
import { authorizeWithMemberOf } from '../lib/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getAdminEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const { user, memberOf, res } = await authorizeWithMemberOf(event)

        if (res) return res

        const id = getParam(event, 'id')
        const item = await dynamoDB.read<JsonDogEvent>({ id })

        const allowed = user.admin ? item : item && memberOf.includes(item.organizer.id)

        metricsSuccess(metrics, event.requestContext, 'getAdminEvent')
        return response(200, allowed, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getAdminEvent')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getAdminEventHandler
