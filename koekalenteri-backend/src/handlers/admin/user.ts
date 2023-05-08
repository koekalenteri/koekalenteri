import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { User, UserRole } from 'koekalenteri-shared/model'

import { authorize } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { response } from '../../utils/response'

const dynamoDB = new CustomDynamoClient(process.env.USER_TABLE_NAME)

export const getUsersHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }
        const adminFor = Object.keys(user?.roles ?? {}).filter((orgId) => user?.roles?.[orgId] == 'admin')
        if (!adminFor.length && !user?.admin) {
          return response(403, 'Forbidden', event)
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

export const setAdminHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        const item: { userId: string; admin: boolean } = JSON.parse(event.body || '{}')

        if (!item || !item.userId) {
          return response(400, 'Bad request', event)
        }

        if (user.id === item.userId || !user.admin) {
          return response(403, 'Forbidden', event)
        }

        const existing = await dynamoDB.read<User>({ id: item.userId })

        if (!existing) {
          return response(404, 'Not found', event)
        }

        dynamoDB.update(
          { id: item.userId },
          'set #admin = :admin',
          {
            '#admin': 'admin',
          },
          {
            ':admin': item.admin,
          }
        )

        return response(200, { ...existing, ...item }, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'addPermission')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

export const setRoleHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        const item: { userId: string; orgId: string; role: UserRole | 'none' } = JSON.parse(event.body || '{}')

        if (!item || !item.orgId) {
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

        const existing = await dynamoDB.read<User>({ id: item.userId })

        if (!existing) {
          return response(404, 'Not found', event)
        }

        const roles = existing.roles || {}
        if (item.role === 'none') {
          delete roles[item.orgId]
        } else {
          roles[item.orgId] = item.role
        }

        dynamoDB.update(
          { id: item.userId },
          'set #roles = :roles',
          {
            '#roles': 'roles',
          },
          {
            ':roles': roles,
          }
        )

        return response(200, { ...existing, roles }, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'addPermission')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
