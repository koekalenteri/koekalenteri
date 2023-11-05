import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'

import { type JsonRegistration } from '../../types'
import { CONFIG } from '../config'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * cancelHandler is called by payment provider, to update cancelled payment status
 */
const cancelHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
      const { eventId, registrationId, transactionId } = parseParams(params)

      try {
        await verifyParams(params)

        const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
        if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        if (transaction.status !== 'fail') {
          await updateTransactionStatus(transactionId, 'fail')

          const registration = await dynamoDB.read<JsonRegistration>(
            {
              eventId: eventId,
              id: registrationId,
            },
            registrationTable
          )
          if (!registration) throw new Error('registration not found')

          if (registration.paymentStatus === 'PENDING') {
            await dynamoDB.update(
              { eventId, id: registrationId },
              'set #paymentStatus = :paymentStatus',
              { '#paymentStatus': 'paymentStatus' },
              {
                ':paymentStatus': 'CANCEL',
              },
              registrationTable
            )
          }
        }

        metricsSuccess(metrics, event.requestContext, 'cancelHandler')
        return response(200, undefined, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'cancelHandler')
        return response(500, undefined, event)
      }
    }
)

export default cancelHandler
