import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonRegistration, JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'

import { i18n } from '../../i18n/lambda'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { updateRegistrations } from '../lib/event'
import { debugProxyEvent } from '../lib/log'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { frontendURL, emailFrom, eventTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * paymentSuccess is called by payment provider, to update successful payment status
 */
const paymentSuccess = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      debugProxyEvent(event)

      const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
      const { eventId, registrationId, transactionId } = parseParams(params)

      try {
        await verifyParams(params)

        const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
        if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        const provider = params['checkout-provider']
        const status = params['checkout-status']

        if (status && (status !== transaction.status || !transaction.statusAt)) {
          await updateTransactionStatus(transactionId, status, provider)

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
              'set #paidAmount = :paidAmount, #paidAt = :paidAt, #paymentStatus = :paymentStatus, #state = :state',
              {
                '#paidAmount': 'paidAmount',
                '#paidAt': 'paidAt',
                '#paymentStatus': 'paymentStatus',
                '#state': 'state',
              },
              {
                ':paidAmount': (registration.paidAmount ?? 0) + amount,
                ':paidAt': new Date().toISOString(),
                ':paymentStatus': 'SUCCESS',
                ':state': 'ready',
              },
              registrationTable
            )

            registration.paidAmount = (registration.paidAmount ?? 0) + amount
            registration.paidAt = new Date().toISOString()
            registration.paymentStatus = 'SUCCESS'
            registration.state = 'ready'

            const confirmedEvent = await updateRegistrations(registration.eventId, eventTable)

            // send receipt
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

            audit({
              auditKey: registrationAuditKey(registration),
              message: `Maksu (${getProviderName(provider)}), ${formatMoney(amount)}`,
              user: transaction.user ?? 'anonymous',
            })

            // send confirmation message
            const to = emailTo(registration)
            const data = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, '')
            await sendTemplatedMail('registration', registration.language, emailFrom, to, data)
          }
        }

        metricsSuccess(metrics, event.requestContext, 'paymentSuccess')
        return response(200, undefined, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'paymentSuccess')
        return response(500, undefined, event)
      }
    }
)

export default paymentSuccess
