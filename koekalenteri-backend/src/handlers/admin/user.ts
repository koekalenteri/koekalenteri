import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { JsonUser, UserRole } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import { i18n } from '../../i18n/index'
import { setUserRole } from '../../lib/user'
import { authorize, getOrigin } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { response } from '../../utils/response'

const dynamoDB = new CustomDynamoClient(process.env.USER_TABLE_NAME)

const userIsAdminFor = (user: JsonUser) =>
  Object.keys(user?.roles ?? {}).filter((orgId) => user?.roles?.[orgId] == 'admin')

const filterRelevantUsers = (users: JsonUser[], user: JsonUser, adminFor: string[]) =>
  user.admin
    ? users
    : users.filter((u) => u.admin || Object.keys(u.roles ?? {}).some((orgId) => adminFor.includes(orgId)))

export const getUsersHandler = metricScope(
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
        const users = (await dynamoDB.readAll<JsonUser>()) ?? []

        metricsSuccess(metrics, event.requestContext, 'getUsers')
        return response(200, filterRelevantUsers(users, user, adminFor), event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getUsers')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

export const addUserHandler = metricScope(
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

        const users = (await dynamoDB.readAll<JsonUser>()) ?? []

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
            ':modÁt': new Date().toISOString(),
            ':modBy': user.name,
          }
        )

        metricsSuccess(metrics, event.requestContext, 'setAdmin')
        return response(200, { ...existing, ...item }, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'setAdmin')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

export const setRoleHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const t = i18n.getFixedT('fi')
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

        const saved = await setUserRole(existing, item.orgId, item.role, user.name, origin)

        metricsSuccess(metrics, event.requestContext, 'setRole')
        return response(200, saved, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'setRole')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
