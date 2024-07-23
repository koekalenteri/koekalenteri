import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const queryEvents = async (since?: string): Promise<JsonDogEvent[] | undefined> => {
  if (since) {
    const modifiedAfter = new Date(Number(since)).toISOString()
    const startSeason = Number(modifiedAfter.substring(0, 4))
    const endSeason = Number(new Date().toISOString().substring(0, 4))
    const result: JsonDogEvent[] = []

    for (let season = startSeason; season <= endSeason; season++) {
      const seasonEvents = await dynamoDB.query<JsonDogEvent>(
        'season = :season AND modifiedAt > :modifiedAfter',
        { ':season': season.toString(), ':modifiedAfter': modifiedAfter },
        CONFIG.eventTable,
        'gsiSeasonModifiedAt'
      )
      if (seasonEvents) result.push(...seasonEvents)
    }

    return result
  }

  return dynamoDB.readAll<JsonDogEvent>()
}

const getAdminEventsHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const { user, memberOf, res } = await authorizeWithMemberOf(event)

        if (res) return res

        const items = await queryEvents(event.queryStringParameters?.since)

        const allowed = items?.filter((item) => user.admin || memberOf.includes(item.organizer.id))

        metricsSuccess(metrics, event.requestContext, 'getAdminEvents')
        return response(200, allowed, event)
      } catch (err) {
        metricsError(metrics, event.requestContext, 'getAdminEvents')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getAdminEventsHandler
