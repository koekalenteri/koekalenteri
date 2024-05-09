import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type {
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonRegistration,
  Organizer,
  RefundPaymentResponse,
} from '../../types'
import type { RefundItem } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { auditRefund } from '../lib/audit'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { debugProxyEvent } from '../lib/log'
import { PaytrailError, refundPayment } from '../lib/paytrail'
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
        const user = await authorize(event)
        if (!user) {
          return response(401, 'Unauthorized', event)
        }

        const { transactionId, amount } = parseJSONWithFallback<{
          transactionId: string
          amount: number
        }>(event.body)

        const paymentTransaction = await dynamoDB.read<JsonPaymentTransaction>({ transactionId }, transactionTable)

        if (!paymentTransaction) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<string>(404, `Transaction with id '${transactionId}' was not found`, event)
        }

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

        if (amount <= 0) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<string>(400, 'Invalid amount', event)
        }

        const reference = `${eventId}:${registrationId}`
        const stamp = nanoid()

        if (paymentTransaction.items?.length !== 1) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<string>(412, 'Unsupported transaction', event)
        }

        const paymentItem = paymentTransaction.items[0]

        const items: RefundItem[] = [
          {
            amount,
            stamp: paymentItem.stamp,
            refundStamp: nanoid(),
            refundReference: registrationId,
          },
        ]

        const result = await refundPayment(
          getApiHost(event),
          transactionId,
          reference,
          stamp,
          items,
          registration?.payer.email
        )

        if (!result) {
          metricsError(metrics, event.requestContext, 'refundCreate')
          return response<undefined>(500, undefined, event)
        }

        const transaction: JsonRefundTransaction = {
          transactionId: result.transactionId,
          status: result.status,
          amount,
          reference,
          provider: result.provider,
          type: 'refund',
          stamp,
          items,
          createdAt: new Date().toISOString(),
          user: user.name,
        }
        await dynamoDB.write(transaction)

        await dynamoDB.update(
          { eventId, id: registrationId },
          'set #refundStatus = :refundStatus',
          { '#refundStatus': 'refundStatus' },
          { ':refundStatus': result.status === 'pending' ? 'PENDING' : 'OK' },
          registrationTable
        )

        if (result.status === 'ok') {
          auditRefund(registration, result.provider, amount, user.name)
        }

        metricsSuccess(metrics, event.requestContext, 'refundCreate')
        return response<RefundPaymentResponse>(200, result, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'refundCreate')

        if (e instanceof PaytrailError) {
          return response(e.status, { error: e.error }, event)
        }

        const error = e instanceof Error ? e.message : 'unknown'
        return response(500, { error }, event)
      }
    }
)

export default refundCreate
