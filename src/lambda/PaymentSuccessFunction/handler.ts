import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'

import { type JsonRegistration } from '../../types'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { sendTemplatedMail } from '../lib/email'
import { updateRegistrations } from '../lib/event'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import { getOrigin } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { emailTo, registrationEmailTemplateData } from '../utils/registration'
import { response } from '../utils/response'

const { emailFrom, eventTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * successHandler is called by payment provider, to update successful payment status
 */
const successHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
      const { eventId, registrationId, transactionId } = parseParams(params)
      const origin = getOrigin(event)

      try {
        await verifyParams(params)

        const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
        if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        const status = params['checkout-status']

        if (status && status !== transaction.status) {
          await updateTransactionStatus(transactionId, status)

          if (status === 'ok') {
            const registration = await dynamoDB.read<JsonRegistration>(
              {
                eventId: eventId,
                id: registrationId,
              },
              registrationTable
            )
            if (!registration) throw new Error('registration not found')

            const amount = parseInt(params['checkout-amount'] ?? '0') / 100

            await dynamoDB.update(
              { eventId, id: registrationId },
              'set #paidAmount = :paidAmount, #paidAt = :paidAt, #paymentStatus = :paymentStatus',
              { '#paidAmount': 'paidAmount', '#paidAt': 'paidAt', '#paymentStatus': 'paymentStatus' },
              {
                ':paidAmount': (registration.paidAmount ?? 0) + amount,
                ':paidAt': new Date().toISOString(),
                ':paymentStatus': 'SUCCESS',
              },
              registrationTable
            )

            // TODO: send receipt

            const confirmedEvent = await updateRegistrations(registration.eventId, eventTable)
            audit({
              auditKey: registrationAuditKey(registration),
              message: 'Maksoi ilmoittautumisen',
              user: registration.createdBy,
            })

            // send confirmation message
            const to = emailTo(registration)
            const data = registrationEmailTemplateData(registration, confirmedEvent, origin, '')

            await sendTemplatedMail('registration', registration.language, emailFrom, to, data)
          }
        }

        metricsSuccess(metrics, event.requestContext, 'successHandler')
        return response(200, undefined, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'successHandler')
        return response(500, undefined, event)
      }
    }
)

export default successHandler
