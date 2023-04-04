import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { User } from 'koekalenteri-shared/model'

import { authorize } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { response } from '../../utils/response'

const dynamoDB = new CustomDynamoClient()

export const getUsersHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        const adminFor = Object.keys(user?.roles ?? {}).filter((orgId) => user?.roles?.[orgId] == 'admin')
        if (!user || (!adminFor.length && !user?.admin)) {
          return response(401, 'Unauthorized', event)
        }
        const users = (await dynamoDB.readAll<User>()) ?? []
        const filtered = user.admin
          ? users
          : users.filter((u) => Object.keys(u.roles ?? {}).some((orgId) => adminFor.includes(orgId)))

        metricsSuccess(metrics, event.requestContext, 'getUsers')
        return response(200, filtered, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getUsers')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
