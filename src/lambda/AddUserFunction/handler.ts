import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonUser } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { parseJSONWithFallback } from '../lib/json'
import { setUserRole } from '../lib/user'
import { authorize, getAndUpdateUserByEmail, getOrigin } from '../utils/auth'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

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
        const item: JsonUser = parseJSONWithFallback(event.body)

        let newUser = await getAndUpdateUserByEmail(item.email, { name: item.name })

        const origin = getOrigin(event)
        for (const orgId of Object.keys(item.roles ?? [])) {
          newUser = await setUserRole(newUser, orgId, item.roles?.[orgId] ?? 'none', user.name, origin)
        }

        metricsSuccess(metrics, event.requestContext, 'addUser')
        return response(200, newUser, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'addUser')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default addUserHandler
