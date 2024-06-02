import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type {
  CreatePaymentResponse,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonTransaction,
  Organizer,
} from '../../types'
import type { PaymentCustomer, PaymentItem } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { getOrigin } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { debugProxyEvent } from '../lib/log'
import { paymentDescription } from '../lib/payment'
import { createPayment, PaytrailError } from '../lib/paytrail'
import { splitName } from '../lib/string'
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
 * paymentCreate is called by client to start the payment process
 */
const paymentCreate = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      debugProxyEvent(event)

      try {
        const { eventId, registrationId } = parseJSONWithFallback<{ eventId: string; registrationId: string }>(
          event.body
        )

        const jsonEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)
        if (!jsonEvent) {
          metricsError(metrics, event.requestContext, 'paymentCreate')
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
          metricsError(metrics, event.requestContext, 'paymentCreate')
          return response<string>(404, 'Registration not found', event)
        }

        const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
        if (!organizer?.paytrailMerchantId) {
          metricsError(metrics, event.requestContext, 'paymentCreate')
          return response<string>(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`, event)
        }

        const reference = `${eventId}:${registrationId}`
        const amount = Math.round(100 * (registrationCost(jsonEvent, registration) - (registration.paidAmount ?? 0)))
        if (amount <= 0) {
          metricsError(metrics, event.requestContext, 'paymentCreate')
          return response<string>(204, 'Already paid', event)
        }
        const stamp = nanoid()

        const items: PaymentItem[] = [
          {
            unitPrice: amount,
            units: 1,
            vatPercentage: 0,
            productCode: eventId,
            description: paymentDescription(jsonEvent, 'fi'),
            stamp: nanoid(),
            reference: registrationId,
            merchant: organizer.paytrailMerchantId,
          },
        ]

        const customer: PaymentCustomer = {
          // We don't want to deliver the receipt from Paytrail to the customer, hence adding '.local' to the email. KOE-763
          email: registration.payer.email && `${registration.payer.email}.local`,
          ...splitName(registration?.payer.name),
          phone: registration.payer.phone,
        }

        const result = await createPayment(
          getApiHost(event),
          getOrigin(event),
          amount,
          reference,
          stamp,
          items,
          customer
        )

        if (!result) {
          metricsError(metrics, event.requestContext, 'paymentCreate')
          return response<undefined>(500, undefined, event)
        }

        const transaction: JsonTransaction = {
          transactionId: result.transactionId,
          status: 'new',
          amount,
          reference,
          bankReference: result.reference,
          type: 'payment',
          stamp,
          items,
          createdAt: new Date().toISOString(),
        }
        await dynamoDB.write(transaction)

        await dynamoDB.update(
          { eventId, id: registrationId },
          'set #paymentStatus = :paymentStatus',
          { '#paymentStatus': 'paymentStatus' },
          { ':paymentStatus': 'PENDING' },
          registrationTable
        )

        metricsSuccess(metrics, event.requestContext, 'paymentCreate')
        return response<CreatePaymentResponse>(200, result, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'paymentCreate')

        if (e instanceof PaytrailError) {
          return response(e.status, { error: e.error }, event)
        }

        const error = e instanceof Error ? e.message : 'unknown'
        return response(500, { error }, event)
      }
    }
)

export default paymentCreate
