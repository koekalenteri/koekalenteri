import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonRefundTransaction, JsonRegistration } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'

import { formatMoney } from '../../lib/money'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { debugProxyEvent } from '../lib/log'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * refundCancel is called by payment provider, to update cancelled refund status
 */
const refundCancel = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      debugProxyEvent(event)

      const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
      const { eventId, registrationId, transactionId } = parseParams(params)

      try {
        await verifyParams(params)

        const transaction = await dynamoDB.read<JsonRefundTransaction>({ transactionId })
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

          if (registration.refundStatus === 'PENDING') {
            await dynamoDB.update(
              { eventId, id: registrationId },
              'set #refundStatus = :refundStatus',
              { '#refundStatus': 'refundStatus' },
              {
                ':refundStatus': 'CANCEL',
              },
              registrationTable
            )
          }

          audit({
            auditKey: registrationAuditKey(registration),
            message: `Palautus epäonnistui (${transaction.provider}), ${formatMoney(transaction.amount / 100)}`,
            user: transaction.user,
          })
        } else {
          console.log(`Transaction '${transactionId}' already marked as failed`)
        }

        metricsSuccess(metrics, event.requestContext, 'refundCancel')
        return response(200, undefined, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'refundCancel')
        return response(500, undefined, event)
      }
    }
)

export default refundCancel
