import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { EventType, JsonJudge } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { fetchJudgesForEventTypes, updateJudges, updateUsersFromJudges } from '../lib/judge'
import KLAPI from '../lib/KLAPI'
import { getKLAPIConfig } from '../lib/secrets'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { eventTypeTable, judgeTable } = CONFIG
const dynamoDB = new CustomDynamoClient(judgeTable)

const getJudgesHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
          const user = await authorize(event)
          if (!user?.admin) {
            return response(401, 'Unauthorized', event)
          }

          const klapi = new KLAPI(getKLAPIConfig)
          const allEventTypes = await dynamoDB.readAll<EventType>(eventTypeTable)
          const eventTypes = allEventTypes?.filter((et) => et.official && et.active) || []
          const judges = await fetchJudgesForEventTypes(
            klapi,
            eventTypes.map((et) => et.eventType)
          )

          if (judges?.length) {
            await updateJudges(dynamoDB, judges)
            await updateUsersFromJudges(dynamoDB, judges)
          }
        }

        const items = (await dynamoDB.readAll<JsonJudge>())?.filter((j) => !j.deletedAt) ?? []

        metricsSuccess(metrics, event.requestContext, 'getJudges')
        return response(200, items, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getJudges')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getJudgesHandler
