import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { CreatePaymentResponse, JsonConfirmedEvent, JsonTransaction, Organizer } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { nanoid } from 'nanoid'

import { type JsonRegistration } from '../../types'
import { CONFIG } from '../config'
import { parseJSONWithFallback } from '../lib/json'
import { createPayment } from '../lib/paytrail'
import { getOrigin } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { getApiHost } from '../utils/event'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { eventTable, organizerTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

const registrationCost = (event: JsonConfirmedEvent, registration: JsonRegistration): number => {
  const isMember = registration.handler?.membership || registration.owner?.membership
  return event.costMember && isMember ? event.costMember : event.cost
}

/**
 * createHandler is called by client to start the payment process
 */
const createHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const { eventId, registrationId } = parseJSONWithFallback<{ eventId: string; registrationId: string }>(
          event.body
        )

        const jsonEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)
        const registration = await dynamoDB.read<JsonRegistration>(
          {
            eventId: eventId,
            id: registrationId,
          },
          registrationTable
        )
        const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
        if (!jsonEvent) {
          metricsError(metrics, event.requestContext, 'createPayment')
          return response<string>(404, 'Event not found', event)
        }
        if (!registration) {
          metricsError(metrics, event.requestContext, 'createPayment')
          return response<string>(404, 'Registration not found', event)
        }
        if (!organizer?.paytrailMerchantId) {
          metricsError(metrics, event.requestContext, 'createPayment')
          return response<string>(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`, event)
        }
        const reference = `${eventId}:${registrationId}`
        const amount = Math.round(100 * (registrationCost(jsonEvent, registration) - (registration.paidAmount ?? 0)))
        if (amount <= 0) {
          metricsError(metrics, event.requestContext, 'createPayment')
          return response<string>(204, 'Already paid', event)
        }
        const stamp = nanoid()

        const result = await createPayment(
          getApiHost(event),
          getOrigin(event),
          amount,
          reference,
          stamp,
          [
            {
              unitPrice: amount,
              units: 1,
              vatPercentage: 0,
              productCode: 'registration',
              stamp: nanoid(),
              reference: registrationId,
              merchant: organizer.paytrailMerchantId,
            },
          ],
          {
            email: registration?.handler.email ?? registration?.owner.email,
          }
        )

        if (!result) {
          metricsError(metrics, event.requestContext, 'createPayment')
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

        metricsSuccess(metrics, event.requestContext, 'createPayment')
        return response<CreatePaymentResponse>(200, result, event)
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'createPayment')
        return response(500, undefined, event)
      }
    }
)

export default createHandler
