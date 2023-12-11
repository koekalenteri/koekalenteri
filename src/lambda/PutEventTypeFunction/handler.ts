import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { EventType, JsonDbRecord, JsonEventType, Judge, Official } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { createDbRecord } from '../utils/proxyEvent'
import { response } from '../utils/response'

const { eventTypeTable, judgeTable, officialTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTypeTable)

const putEventTypeHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user?.admin) {
        return response(401, 'Unauthorized', event)
      }

      const timestamp = new Date().toISOString()

      try {
        const item = createDbRecord<JsonEventType>(event, timestamp, user.name)
        await dynamoDB.write(item)
        if (!item.active) {
          const active = (await dynamoDB.readAll<EventType>())?.filter((et) => et.active) || []

          const judgesToRemove =
            (await dynamoDB.readAll<Judge & JsonDbRecord>(judgeTable))?.filter(
              (j) => !j.deletedAt && !active.some((et) => j.eventTypes?.includes(et.eventType))
            ) || []
          for (const judge of judgesToRemove) {
            await dynamoDB.write(
              {
                ...judge,
                deletedAt: timestamp,
                deletedBy: user.name,
              },
              judgeTable
            )
          }

          const officialsToRemove =
            (await dynamoDB.readAll<Official & JsonDbRecord>(officialTable))?.filter(
              (o) => !o.deletedAt && !active.some((et) => o.eventTypes?.includes(et.eventType))
            ) || []
          for (const official of officialsToRemove) {
            await dynamoDB.write(
              {
                ...official,
                deletedAt: timestamp,
                deletedBy: user.name,
              },
              officialTable
            )
          }
        }
        metricsSuccess(metrics, event.requestContext, 'putEventType')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putEventType')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default putEventTypeHandler
