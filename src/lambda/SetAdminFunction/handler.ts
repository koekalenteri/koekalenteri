import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonUser } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)

const setAdminHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        const item: { userId: string; admin: boolean } = JSON.parse(event.body || '{}')

        if (!item?.userId) {
          return response(400, 'Bad request', event)
        }

        if (user.id === item.userId || !user.admin) {
          return response(403, 'Forbidden', event)
        }

        const existing = await dynamoDB.read<JsonUser>({ id: item.userId })

        if (!existing) {
          return response(404, 'Not found', event)
        }

        await dynamoDB.update(
          { id: item.userId },
          'set #admin = :admin, #modAt = :modAt, #modBy = :modBy',
          {
            '#admin': 'admin',
            '#modAt': 'modifiedAt',
            '#modBy': 'modifiedBy',
          },
          {
            ':admin': item.admin,
            ':modAt': new Date().toISOString(),
            ':modBy': user.name,
          }
        )

        metricsSuccess(metrics, event.requestContext, 'setAdmin')
        return response(200, { ...existing, ...item }, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'setAdmin')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default setAdminHandler
