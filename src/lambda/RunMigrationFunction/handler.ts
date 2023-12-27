import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonDogEvent, JsonJudge } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorize } from '../utils/auth'
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
        const events = (await dynamoDB.readAll<JsonDogEvent>(CONFIG.eventTable)) ?? []
        const judges = (await dynamoDB.readAll<JsonJudge>(CONFIG.judgeTable)) ?? []
        let count = 0

        for (const item of events) {
          if (item.judges?.length && typeof item.judges[0] === 'number') {
            // @ts-expect-error migrated types
            const judgeIds: number[] = item.judges
            item.judges = []
            for (const judgeId of judgeIds) {
              const judge = judges.find((j) => j.id === judgeId)
              item.judges.push({ id: judgeId, name: judge?.name ?? '?' })
            }
            item.modifiedAt = timestamp
            item.modifiedBy = 'migration'

            dynamoDB.write(item, CONFIG.eventTable)
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
