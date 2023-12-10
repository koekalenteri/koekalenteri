import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonUser } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { filterRelevantUsers, userIsMemberOf } from '../lib/user'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

const getUsersHandler = metricScope(
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
        const users = (await dynamoDB.readAll<JsonUser>()) ?? []

        metricsSuccess(metrics, event.requestContext, 'getUsers')
        return response(200, filterRelevantUsers(users, user, memberOf), event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getUsers')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getUsersHandler
