import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonRegistration } from '../../types'

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

      const timestamp = new Date().toISOString()

      try {
        const registrations = (await dynamoDB.readAll<JsonRegistration>(CONFIG.registrationTable)) ?? []
        let count = 0

        for (const item of registrations) {
          if (!item.state) {
            item.state = item.paidAt ? 'ready' : 'creating'
            item.modifiedAt = timestamp
            item.modifiedBy = 'migration'

            await dynamoDB.write(item, CONFIG.registrationTable)
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
