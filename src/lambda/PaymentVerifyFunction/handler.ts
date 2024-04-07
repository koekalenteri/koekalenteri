import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonTransaction, VerifyPaymentResponse } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { parseJSONWithFallback } from '../lib/json'
import { debugProxyEvent } from '../lib/log'
import { parseParams, verifyParams } from '../lib/payment'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.transactionTable)

/**
 * paymentVerify is called by client when returning from payment provider.
 */
const paymentVerify = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      debugProxyEvent(event)

      const params: Partial<PaytrailCallbackParams> = parseJSONWithFallback(event.body)
      const { eventId, registrationId, transactionId, status: paymentStatus } = parseParams(params)

      try {
        await verifyParams(params)

        /**
         * NB: the stored transaction status is probably outdated, since its updated by callback from the payment provider.
         */
        const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
        if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        const status = paymentStatus === 'fail' ? 'error' : 'ok'

        metricsSuccess(metrics, event.requestContext, 'paymentVerify')
        return response<VerifyPaymentResponse>(200, { status, paymentStatus, eventId, registrationId }, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'paymentVerify')
        return response<VerifyPaymentResponse>(200, { status: 'error', paymentStatus, eventId, registrationId }, event)
      }
    }
)

export default paymentVerify
