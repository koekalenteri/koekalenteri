import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { unescape } from 'querystring'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { userIsMemberOf } from '../lib/user'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getAdminEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        const memberOf = userIsMemberOf(user)
        if (!memberOf.length && !user?.admin) {
          console.error(`User ${user.id} is not admin or member of any organizations.`)
          return response(403, 'Forbidden', event)
        }

        console.log(`User ${user.id} is member of ['${memberOf.join("', '")}'].`)

        const id = unescape(event.pathParameters?.id ?? '')
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
