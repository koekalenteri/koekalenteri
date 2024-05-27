import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonConfirmedEvent, JsonRefundTransaction, JsonRegistration } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'

import { i18n } from '../../i18n/lambda'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { sendTemplatedMail } from '../lib/email'
import { debugProxyEvent } from '../lib/log'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { registrationEmailTemplateData } from '../utils/registration'
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
            const provider = params['checkout-provider']
            const providerName = getProviderName(provider)

            const changes: Required<Pick<JsonRegistration, 'refundAmount' | 'refundAt' | 'refundStatus'>> = {
              refundAmount: (registration.refundAmount ?? 0) + amount,
              refundAt: new Date().toISOString(),
              refundStatus: 'SUCCESS',
            }

            await dynamoDB.update(
              { eventId, id: registrationId },
              'set #refundAmount = :refundAmount, #refundAt = :refundAt, #refundStatus = :refundStatus',
              {
                '#refundAmount': 'refundAmount',
                '#refundAt': 'refundAt',
                '#refundStatus': 'refundStatus',
              },
              {
                ':refundAmount': changes.refundAmount,
                ':refundAt': changes.refundAt,
                ':refundStatus': changes.refundStatus,
              },
              registrationTable
            )

            registration.refundAmount = (registration.refundAmount ?? 0) + amount
            registration.refundAt = new Date().toISOString()
            registration.refundStatus = 'SUCCESS'

            const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)

            if (confirmedEvent) {
              // send refund notification
              try {
                const recipient = [registration.payer.email]
                const templateData = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, 'refund')
                await sendTemplatedMail('refund', registration.language, emailFrom, recipient, {
                  ...templateData,
                  ...transaction,
                  ...changes,
                  createdAt: t('dateFormat.long', { date: transaction.createdAt }),
                  refundAt: t('dateFormat.long', { date: registration.refundAt }),
                  paidAmount: formatMoney(registration.paidAmount ?? 0),
                  amount: formatMoney(amount),
                  handlingCost: formatMoney(Math.max(0, (registration.paidAmount ?? 0) - amount)),
                  providerName,
                })
              } catch (e) {
                // this is not fatal
                console.error('failed to send refund email', e)
              }
            }

            audit({
              auditKey: registrationAuditKey(registration),
              message: `Palautus (${providerName}), ${formatMoney(amount)}`,
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
