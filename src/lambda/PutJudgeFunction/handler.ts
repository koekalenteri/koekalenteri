import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { authorize } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { createDbRecord } from '../utils/proxyEvent'
import { response } from '../utils/response'

export const dynamoDB = new CustomDynamoClient(CONFIG.judgeTable)

const putJudgeHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user) {
        return response(401, 'Unauthorized', event)
      }
      const timestamp = new Date().toISOString()

      try {
        const item = createDbRecord(event, timestamp, user.name)
        await dynamoDB.write(item)
        metricsSuccess(metrics, event.requestContext, 'putJudge')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putJudge')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default putJudgeHandler
