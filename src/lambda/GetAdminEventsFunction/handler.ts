import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { userIsMemberOf } from '../lib/user'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getEventsHandler = metricScope(
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

        // @todo add index & use query to get relevant items
        const items = await dynamoDB.readAll<JsonDogEvent>()
        const allowed = items?.filter((item) => memberOf.includes(item.organizer.id))

        metricsSuccess(metrics, event.requestContext, 'getAdminEvents')
        return response(200, allowed, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getAdminEvents')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getEventsHandler
