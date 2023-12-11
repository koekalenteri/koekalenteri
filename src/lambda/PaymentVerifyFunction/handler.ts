import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonTransaction, VerifyPaymentResponse } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { parseJSONWithFallback } from '../lib/json'
import { parseParams, verifyParams } from '../lib/payment'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.transactionTable)

/**
 * vefiryHandler is called by client when returning from payment provider.
 */
const verifyHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const params: Partial<PaytrailCallbackParams> = parseJSONWithFallback(event.body)
      const { eventId, registrationId, transactionId } = parseParams(params)

      try {
        await verifyParams(params)

        const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
        if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        metricsSuccess(metrics, event.requestContext, 'verifyHandler')
        return response<VerifyPaymentResponse>(
          200,
          { status: transaction?.status === 'fail' ? 'error' : 'ok', eventId, registrationId },
          event
        )
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'verifyHandler')
        return response<VerifyPaymentResponse>(501, { status: 'error', eventId: '', registrationId: '' }, event)
      }
    }
)

export default verifyHandler
