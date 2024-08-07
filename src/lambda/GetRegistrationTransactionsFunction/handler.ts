import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'

import { metricScope } from 'aws-embedded-metrics'

import { getParam } from '../lib/apigw'
import { authorize } from '../lib/auth'
import { getTransactionsByReference } from '../lib/payment'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const getRegistrationTransactions = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }
        const eventId = getParam(event, 'eventId')
        const id = getParam(event, 'id')
        const reference = `${eventId}:${id}`
        const transactions = await getTransactionsByReference(reference)

        metricsSuccess(metrics, event.requestContext, 'getRegistrationTransactions')
        return response(200, transactions, event)
      } catch (err: unknown) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getRegistrationTransactions')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getRegistrationTransactions
