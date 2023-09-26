import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonEvent, Organizer } from 'koekalenteri-shared/model'

import { metricScope } from 'aws-embedded-metrics'
import { type JsonRegistration } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import { calculateHmac, createPayment } from '../lib/paytrail'
import { getPaytrailConfig } from '../lib/secrets'
import { getOrigin, getUsername } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { currentFinnishTime } from '../utils/dates'
import { getApiHost } from '../utils/event'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { redirect, response } from '../utils/response'

import { sendReceipt } from './email'

const dynamoDB = new CustomDynamoClient()

type Source = 'notification' | 'user'

const handlePayment = async (
  event: APIGatewayProxyEvent,
  source: Source,
  metrics: MetricsLogger
): Promise<APIGatewayProxyResult> => {
  const cfg = await getPaytrailConfig()

  const timestamp = new Date().toISOString()
  const username = await getUsername(event)

  console.log(event.headers)
  console.log(event.requestContext)

  const {
    'checkout-reference': eventId = '',
    'checkout-status': queryStatus = '',
    'checkout-stamp': registrationId = '',
    'checkout-transaction-id': transactionId = '',
    signature,
  } = event.headers
  const checkoutHeaders = Object.fromEntries(
    Object.entries(event.headers).filter(([key]) => key.startsWith('checkout-'))
  )

  if (calculateHmac(cfg.PAYTRAIL_SECRET, checkoutHeaders) !== signature) {
    //!!!
    console.log('warn', 'Verifying Paytrail signature failed', event)

    throw new Error(`Payment verification failed with transaction id "${transactionId}"`)
  }

  try {
    const registration = await dynamoDB.read<JsonRegistration>({ eventId: eventId, id: registrationId })
    if (!registration) {
      console.log('warn', `Payment event not found id "${registrationId}`)
      throw new Error(`Unknown payment event for registration id "${registrationId}"`)
    }
    // modification info is always updated
    registration.modifiedAt = timestamp
    registration.modifiedBy = username

    const { receiptSent = false, paymentStatus = 'PENDING', paidAt } = registration

    /*
     * If status is already set and this is a direct call, it's either double click / refresh,
     * or callback has arrived before redirect.
     */
    if (source === 'user' && paymentStatus === 'SUCCESS') {
      console.log('info', 'Payment already handled', {
        eventId,
        paymentStatus,
        paidAt,
        receiptSent,
        registrationId,
        transactionId,
      })

      return response(200, registration, event)
    }

    registration.paymentStatus = queryStatus === 'ok' ? 'SUCCESS' : queryStatus === 'fail' ? 'CANCEL' : paymentStatus
    registration.paidAt = paymentStatus === 'SUCCESS' ? currentFinnishTime() : undefined

    /*
     * Send confirmation and receipt only from callback to avoid sending them twice in case
     * redirect and callback arrive nearly simultaneously.
     */
    if (registration.paidAt && !receiptSent && source === 'notification') {
      // TODO: try/catch so we always end up writing the registration to db
      // !!!const receiptResult =
      await sendReceipt(registration, new Date(registration.paidAt).toLocaleDateString('fi'))
      // registration.receiptSent = receiptResult.isOk()
    }

    await dynamoDB.write(registration)

    console.log('info', 'Registration state updated', {
      eventId,
      paymentStatus,
      paidAt,
      receiptSent,
      registrationId,
      transactionId,
    })

    metricsSuccess(metrics, event.requestContext, 'handlePayment')
    return response(200, registration, event)
  } catch (err) {
    metricsError(metrics, event.requestContext, 'handlePayment')
    return response((err as AWSError).statusCode || 501, err, event)
  }
}

const redirectToFinish = async (event: APIGatewayProxyEvent, r: APIGatewayProxyResult) => {
  const origin = getOrigin(event)
  const registration = JSON.parse(r.body)
  // TODO Paths should probably be in a common place for both BE and FE
  const path = r.statusCode == 200 ? `${origin}/r/${registration.eventId}/${registration.id}` : `${origin}/` // TODO needs redirect to valid error page

  return redirect(registration, path)
}

export const paymentConfirm = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const retValue = await handlePayment(event, 'user', metrics)

      return redirectToFinish(event, retValue)
    }
)

export const paymentCancel = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const retValue = await handlePayment(event, 'user', metrics)

      return redirectToFinish(event, retValue)
    }
)

export const paymentNotification = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const retValue = await handlePayment(event, 'notification', metrics)
      if (retValue.statusCode != 200) {
        return retValue
      }
      const registration: JsonRegistration = JSON.parse(retValue.body)
      const processed = (registration.confirmed && registration.receiptSent) || registration.cancelled

      // If the payment hasn't been completely processed, send an error response to receive further notifications and try again.
      return processed ? response(200, undefined, event) : response(500, 'Unexpected', event)
    }
)

export const createPaymentHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const { eventId, registrationId } = JSON.parse(event.body || '{}')

      const jsonEvent = await dynamoDB.read<JsonEvent>({ id: eventId }, process.env.EVENT_TABLE_NAME)
      const registration = await dynamoDB.read<JsonRegistration>({ eventId: eventId, id: registrationId })
      const organizer = await dynamoDB.read<Organizer>(
        { id: jsonEvent?.organizer.id },
        process.env.ORGANIZER_TABLE_NAME
      )
      if (!jsonEvent || !registration || !organizer?.paytrailMerchantId) {
        throw new Error('errors')
      }
      const amount = (registration.totalAmount ?? jsonEvent.cost) - (registration.paidAmount ?? 0)

      const result = await createPayment(
        getApiHost(event),
        getOrigin(event),
        organizer.paytrailMerchantId,
        amount,
        eventId,
        [
          {
            unitPrice: 10,
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

      metricsSuccess(metrics, event.requestContext, 'createPayment')
      return response(200, result, event)
    }
)
