import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonConfirmedEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const putEventHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user) {
        return response(401, 'Unauthorized', event)
      }

      const timestamp = new Date().toISOString()

      try {
        let existing
        const item: JsonConfirmedEvent = parseJSONWithFallback(event.body)
        if (item.id) {
          existing = await dynamoDB.read<JsonConfirmedEvent>({ id: item.id })
          if (!user.admin && !user.roles?.[existing?.organizer?.id ?? '']) {
            return response(403, 'Forbidden', event)
          }
        } else {
          item.id = nanoid(10)
          item.createdAt = timestamp
          item.createdBy = user.name
        }

        if (
          existing?.state === 'confirmed' &&
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
        if (!user.admin && !user.roles?.[data.organizer?.id ?? '']) {
          return response(403, 'Forbidden', event)
        }
        await dynamoDB.write(data)
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
