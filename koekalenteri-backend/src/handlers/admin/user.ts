import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { Organizer, User, UserRole } from 'koekalenteri-shared/model'

import { i18n } from '../../i18n/index'
import { authorize } from '../../utils/auth'
import { getOrigin } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../../utils/metrics'
import { response } from '../../utils/response'
import { EMAIL_FROM, sendTemplatedMail } from '../email'

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

        if (!item?.userId) {
          return response(400, 'Bad request', event)
        }

        if (user.id === item.userId || !user.admin) {
          return response(403, 'Forbidden', event)
        }

        const existing = await dynamoDB.read<User>({ id: item.userId })

        if (!existing) {
          return response(404, 'Not found', event)
        }

        await dynamoDB.update(
          { id: item.userId },
          'set #admin = :admin',
          {
            '#admin': 'admin',
          },
          {
            ':admin': item.admin,
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

        await dynamoDB.update(
          { id: item.userId },
          'set #roles = :roles',
          {
            '#roles': 'roles',
          },
          {
            ':roles': roles,
          }
        )

        const org = await dynamoDB.read<Organizer>({ id: item.orgId }, process.env.ORGANIZER_TABLE_NAME)

        if (item.role !== 'none') {
          await sendTemplatedMail('access', 'fi', EMAIL_FROM, [existing.email], {
            user: {
              firstName: existing.name.split(' ')[0],
              email: existing.email,
            },
            link: `${origin}/login`,
            orgName: org?.name,
            roleName: t(`user.role.${item.role}`),
            admin: item.role === 'admin',
            secretary: item.role === 'secretary',
          })
        }

        metricsSuccess(metrics, event.requestContext, 'setRole')
        return response(200, { ...existing, roles }, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'setRole')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
