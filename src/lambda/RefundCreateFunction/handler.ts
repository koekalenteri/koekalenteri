import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type {
  JsonConfirmedEvent,
  JsonRegistration,
  JsonTransaction,
  Organizer,
  RefundPaymentResponse,
} from '../../types'
import type { RefundItem } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { parseJSONWithFallback } from '../lib/json'
import { debugProxyEvent } from '../lib/log'
import { formatMoney } from '../lib/payment'
import { refundPayment } from '../lib/paytrail'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { getApiHost } from '../utils/proxyEvent'
import { response } from '../utils/response'

const { eventTable, organizerTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

const registrationCost = (event: JsonConfirmedEvent, registration: JsonRegistration): number => {
  const isMember = registration.handler?.membership || registration.owner?.membership
  return event.costMember && isMember ? event.costMember : event.cost
}

/**
 * refundCreate is called by client to refund a payment
 */
const refundCreate = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      debugProxyEvent(event)

      try {
        const { transactionId, amount } = parseJSONWithFallback<{
          transactionId: string
          amount: number
        }>(event.body)

        const paymentTransaction = await dynamoDB.read<JsonTransaction>({ transactionId }, transactionTable)
        if (!paymentTransaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        const [eventId, registrationId] = paymentTransaction.reference.split(':')

        const jsonEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)
        if (!jsonEvent) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<string>(404, 'Event not found', event)
        }

        const registration = await dynamoDB.read<JsonRegistration>(
          {
            eventId: eventId,
            id: registrationId,
          },
          registrationTable
        )
        if (!registration) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<string>(404, 'Registration not found', event)
        }

        const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
        if (!organizer?.paytrailMerchantId) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<string>(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`, event)
        }

        const reference = `${eventId}:${registrationId}`
        if (amount <= 0) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<string>(400, 'Invalid amount', event)
        }
        const stamp = nanoid()

        const items: RefundItem[] = [
          {
            amount,
            stamp: nanoid(),
            refundStamp: stamp,
            refundReference: registrationId,
            // commission:
          },
        ]

        const result = await refundPayment(
          getApiHost(event),
          transactionId,
          amount,
          reference,
          stamp,
          items,
          registration?.payer.email
        )

        if (!result) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<undefined>(500, undefined, event)
        }

        const transaction: JsonTransaction = {
          transactionId: result.transactionId,
          status: result.status,
          amount,
          reference,
          provider: result.provider,
          type: 'refund',
          stamp,
          items,
          createdAt: new Date().toISOString(),
        }
        await dynamoDB.write(transaction)

        await dynamoDB.update(
          { eventId, id: registrationId },
          'set #refundStatus = :refundStatus',
          { '#refundtStatus': 'refundStatus' },
          { ':refundStatus': result.status === 'pending' ? 'PENDING' : 'OK' },
          registrationTable
        )

        if (result.status === 'ok') {
          audit({
            auditKey: registrationAuditKey(registration),
            message: `Palautus (${result.provider}), ${formatMoney(amount)}`,
            user: registration.createdBy,
          })
        }

        metricsSuccess(metrics, event.requestContext, 'refundCreate')
        return response<RefundPaymentResponse>(200, result, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'refundCreate')
        return response(500, undefined, event)
      }
    }
)

export default refundCreate
