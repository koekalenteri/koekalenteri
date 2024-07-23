import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const runMigrationHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user?.admin) {
        return response(401, 'Unauthorized', event)
      }

      try {
        const events = (await dynamoDB.readAll<JsonDogEvent>()) ?? []

        let count = 0

        for (const item of events) {
          if (!item.season) {
            item.season = item.startDate.substring(0, 4)
            await dynamoDB.write(item)
            count++
          }
        }

        metricsSuccess(metrics, event.requestContext, 'runMigration')
        return response(200, count, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'runMigration')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default runMigrationHandler
