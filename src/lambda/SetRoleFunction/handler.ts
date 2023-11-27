import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonUser, UserRole } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { setUserRole } from '../lib/user'
import { authorize, getOrigin } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

const setRoleHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        const origin = getOrigin(event)
        const item: { userId: string; orgId: string; role: UserRole | 'none' } = JSON.parse(event.body || '{}')

        if (!item?.orgId) {
          return response(400, 'Bad request', event)
        }

        if (user.id === item.userId) {
          console.warn('Trying to set own roles', { user, item })
          return response(403, 'Forbidden', event)
        }

        if (!user.admin && user.roles?.[item.orgId] !== 'admin') {
          console.warn('User does not have right to set role', { user, item })
          return response(403, 'Forbidden', event)
        }

        const existing = await dynamoDB.read<JsonUser>({ id: item.userId })

        if (!existing) {
          return response(404, 'Not found', event)
        }

        const saved = await setUserRole(existing, item.orgId, item.role, user.name ?? user.email, origin)

        metricsSuccess(metrics, event.requestContext, 'setRole')
        return response(200, saved, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'setRole')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default setRoleHandler
