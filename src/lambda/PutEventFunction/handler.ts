import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonConfirmedEvent, JsonUser } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { isValidForEntry } from '../../lib/utils'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const isUserForbidden = (
  user: JsonUser,
  existing: JsonConfirmedEvent | undefined,
  item: JsonConfirmedEvent
): boolean => {
  if (user.admin) return false
  if (existing?.organizer?.id && !user.roles?.[existing.organizer.id]) return true
  if (item?.organizer?.id && !user.roles?.[item.organizer.id]) return true

  return false
}

const putEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user) {
        return response(401, 'Unauthorized', event)
      }

      const timestamp = new Date().toISOString()

      try {
        const item: JsonConfirmedEvent = parseJSONWithFallback(event.body)
        const existing = item.id ? await dynamoDB.read<JsonConfirmedEvent>({ id: item.id }) : undefined

        if (isUserForbidden(user, existing, item)) {
          return response(403, 'Forbidden', event)
        }

        if (!existing) {
          item.id = nanoid(10)
          item.createdAt = timestamp
          item.createdBy = user.name
        }

        if (
          existing &&
          isValidForEntry(existing?.state) &&
          existing.entryEndDate &&
          !existing.entryOrigEndDate &&
          item.entryEndDate &&
          item.entryEndDate > existing.entryEndDate
        ) {
          // entry period was extended, use additional field to store the original entry end date
          item.entryOrigEndDate = existing.entryEndDate
        }

        // modification info is always updated
        item.modifiedAt = timestamp
        item.modifiedBy = user.name

        const data = { ...existing, ...item }
        await dynamoDB.write(data)

        if (existing && existing.entries !== data.entries) {
          // update registrations in case the secretary version was out of date
          updateRegistrations(data.id, CONFIG.eventTable)
        }

        metricsSuccess(metrics, event.requestContext, 'putEvent')
        return response(200, data, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putEvent')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default putEventHandler
