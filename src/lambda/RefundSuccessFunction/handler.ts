import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonRefundTransaction, JsonRegistration } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'

import { i18n } from '../../i18n/lambda'
import { formatMoney } from '../../lib/money'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { debugProxyEvent } from '../lib/log'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { frontendURL, emailFrom, eventTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * refundSuccess is called by payment provider, to update successful refund status
 */
const refundSuccess = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      debugProxyEvent(event)

      const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
      const { eventId, registrationId, transactionId } = parseParams(params)

      try {
        await verifyParams(params)

        const transaction = await dynamoDB.read<JsonRefundTransaction>({ transactionId })
        if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        const status = params['checkout-status']

        if (status) {
          if (status !== transaction.status || !transaction.statusAt) {
            await updateTransactionStatus(transactionId, status)
          }

          if (status === 'ok') {
            const registration = await dynamoDB.read<JsonRegistration>(
              {
                eventId: eventId,
                id: registrationId,
              },
              registrationTable
            )
            if (!registration) throw new Error('registration not found')
            const t = i18n.getFixedT(registration.language)
            const amount = parseInt(params['checkout-amount'] ?? '0') / 100

            await dynamoDB.update(
              { eventId, id: registrationId },
              'set #refundAmount = :refundAmount, #refundAt = :refundAt, #refundStatus = :refundStatus',
              {
                '#refundAmount': 'refundAmount',
                '#refundAt': 'refundAt',
                '#refundStatus': 'refundStatus',
              },
              {
                ':refundAmount': (registration.refundAmount ?? 0) + amount,
                ':refundAt': new Date().toISOString(),
                ':refundStatus': 'SUCCESS',
              },
              registrationTable
            )

            // const confirmedEvent = await updateRegistrations(registration.eventId, eventTable)

            // send receipt
            /*
            try {
              const receiptTo = [registration.payer.email]
              const receiptData = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, 'receipt')
              await sendTemplatedMail('receipt', registration.language, emailFrom, receiptTo, {
                ...receiptData,
                ...transaction,
                createdAt: t('dateFormat.long', { date: transaction.createdAt }),
                amount: formatMoney(amount),
              })
            } catch (e) {
              // this is not fatal
              console.error('failed to send receipt', e)
            }
            */

            audit({
              auditKey: registrationAuditKey(registration),
              message: `Palautus (${transaction.provider}), ${formatMoney(amount / 100)}`,
              user: transaction.user,
            })
          }
        }

        metricsSuccess(metrics, event.requestContext, 'refundSuccess')
        return response(200, undefined, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'refundSuccess')
        return response(500, undefined, event)
      }
    }
)

export default refundSuccess
