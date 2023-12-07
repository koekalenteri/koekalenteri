import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonUser } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { filterRelevantUsers, getAllUsers, setUserRole } from '../lib/user'
import { authorize, getOrigin } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

const userIsAdminFor = (user: JsonUser) =>
  Object.keys(user?.roles ?? {}).filter((orgId) => user?.roles?.[orgId] === 'admin')

const addUserHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }
        const adminFor = userIsAdminFor(user)
        if (!adminFor.length && !user?.admin) {
          return response(403, 'Forbidden', event)
        }
        const item: JsonUser = JSON.parse(event.body || '{}')
        const timestamp = new Date().toISOString()

        const users = await getAllUsers()

        const idx = users.findIndex((u) => u.email === item.email)
        if (idx >= 0) {
          const origin = getOrigin(event)
          for (const orgId of Object.keys(item.roles ?? [])) {
            users[idx] = await setUserRole(users[idx], orgId, item.roles?.[orgId] ?? 'none', user.name, origin)
          }
        } else {
          item.id = nanoid(10)
          item.createdAt = timestamp
          item.createdBy = user.name

          await dynamoDB.write(item)
          users.push(item)
        }

        metricsSuccess(metrics, event.requestContext, 'addUser')
        return response(200, filterRelevantUsers(users, user, adminFor), event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'addUser')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default addUserHandler
