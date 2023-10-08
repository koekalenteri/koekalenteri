import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type {
  CreatePaymentResponse,
  JsonConfirmedEvent,
  JsonTransaction,
  Organizer,
  VerifyPaymentResponse,
} from 'koekalenteri-shared/model'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { metricScope } from 'aws-embedded-metrics'
import { type JsonRegistration } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { calculateHmac, createPayment, HMAC_KEY_PREFIX } from '../lib/paytrail'
import { getPaytrailConfig } from '../lib/secrets'
import { getOrigin } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { getApiHost } from '../utils/event'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()
const { eventTable, organizerTable, registrationTable } = CONFIG

const parseParams = (headers: Partial<PaytrailCallbackParams>) => {
  const [eventId, registrationId] = headers['checkout-reference']?.split(':') ?? []

  return { eventId, registrationId, transactionId: headers['checkout-transaction-id'] }
}

const verifyParams = async (params: Partial<PaytrailCallbackParams>) => {
  if (!params['checkout-transaction-id']) {
    console.error('Missing checkout-transaction-id from params', { params })
    throw new Error('Missing checkout-transaction-id from params')
  }

  const cfg = await getPaytrailConfig()
  const signature = params.signature
  const hmacParams = Object.fromEntries(Object.entries(params).filter(([key]) => key.startsWith(HMAC_KEY_PREFIX)))
  const hmac = calculateHmac(cfg.PAYTRAIL_SECRET, hmacParams)

  if (hmac !== signature) {
    console.error('Verifying payment signature failed', { hmac, signature, params })
    throw new Error('Verifying payment signature failed')
  }
}

const registrationCost = (event: JsonConfirmedEvent, registration: JsonRegistration): number => {
  const isMember = registration.handler?.membership || registration.owner?.membership
  return event.costMember && isMember ? event.costMember : event.cost
}

/**
 * createHandler is called by client to start the payment process
 */
export const createHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const { eventId, registrationId } = JSON.parse(event.body || '{}')

      const jsonEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)
      const registration = await dynamoDB.read<JsonRegistration>(
        {
          eventId: eventId,
          id: registrationId,
        },
        registrationTable
      )
      const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
      if (!jsonEvent || !registration || !organizer?.paytrailMerchantId) {
        throw new Error('errors')
      }
      const reference = `${eventId}:${registrationId}`
      const amount = Math.round(100 * registrationCost(jsonEvent, registration) - (registration.paidAmount ?? 0))
      if (amount <= 0) {
        throw new Error('already paid')
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
    }
)

/**
 * vefiryHandler is called by client when returning from payment provider.
 */
export const verifyHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const params: Partial<PaytrailCallbackParams> = JSON.parse(event.body || '{}')
      const { eventId, registrationId, transactionId } = parseParams(params)

      try {
        await verifyParams(params)

        const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
        if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        metricsSuccess(metrics, event.requestContext, 'verifyHandler')
        return response<VerifyPaymentResponse>(
          200,
          { status: transaction?.status === 'fail' ? 'error' : 'ok', eventId, registrationId },
          event
        )
      } catch (e) {
        console.error(e)
        metricsError(metrics, event.requestContext, 'verifyHandler')
        return response<VerifyPaymentResponse>(501, { status: 'error', eventId: '', registrationId: '' }, event)
      }
    }
)

const updateTransactionStatus = async (transactionId: string | undefined, status: JsonTransaction['status']) => {
  if (!transactionId) return

  dynamoDB.update(
    { transactionId },
    'set #status = :status, #statusAt = :statusAt',
    {
      '#status': 'status',
      '#statusAt': 'statusAt',
    },
    {
      ':status': status,
      ':statusAt': new Date().toISOString(),
    }
  )
}

/**
 * successHandler is called by payment provider, to update successful payment status
 */
export const successHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const params: Partial<PaytrailCallbackParams> = event.headers
      const { eventId, registrationId, transactionId } = parseParams(params)

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
              'set #paidAmount = :amount, #paidAt = :paidAt',
              { '#paidAmount': 'paidAmount', '#paidAt': 'paidAt' },
              { ':paidAmount': (registration.paidAmount ?? 0) + amount, ':paidAt': new Date().toISOString() },
              registrationTable
            )
            // send receipt
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

/**
 * successHandler is called by payment provider, to update cancelled payment status
 */
export const cancelHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const params: Partial<PaytrailCallbackParams> = event.headers
      const { /* eventId, registrationId, */ transactionId } = parseParams(params)

      try {
        await verifyParams(params)

        const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
        if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

        if (transaction.status !== 'fail') {
          await updateTransactionStatus(transactionId, 'fail')
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
