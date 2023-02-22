import { metricScope, MetricsLogger } from "aws-embedded-metrics"
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda"
import { AWSError } from "aws-sdk"
import { JsonRegistration } from "koekalenteri-shared/model"

import CustomDynamoClient from "../utils/CustomDynamoClient"
import { currentFinnishTime } from "../utils/dates"
import { getSSMParams } from "../utils/environment"
import { getOrigin, getUsername } from "../utils/genericHandlers"
import { metricsError, metricsSuccess } from "../utils/metrics"
import { calculateHmac, PaytrailConfig } from "../utils/payment"
import { redirect, response } from "../utils/response"

import { sendReceipt } from "./email"

const dynamoDB = new CustomDynamoClient()

type Source = 'notification' | 'user'

type HandlePayment = (event: APIGatewayProxyEvent, source: Source, metrics: MetricsLogger) => Promise<APIGatewayProxyResult>

export const paymentConfirm = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const retValue = await handlePayment(event, 'user', metrics)

    return redirectToFinish(event, retValue)
  },
)

export const paymentCancel = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const retValue =  await handlePayment(event, 'user', metrics)

    return redirectToFinish(event, retValue)
  },
)

export const paymentNotification = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const retValue = await handlePayment(event, 'notification', metrics)
    if (retValue.statusCode != 200) {
      return retValue
    }
    const registration = JSON.parse(retValue.body)
    const processed = (registration.confirmed && registration.receiptSent) || registration.cancelled
  
    // If the payment hasn't been completely processed, send an error response to receive further notifications and try again.
    return processed ? response(200, undefined) : response(500, 'Unexpected')
  },
)
  
const handlePayment: HandlePayment = async (event, source, metrics) => {
  const env = await getSSMParams(['PaytrailMerchantSecret' ]) as PaytrailConfig 

  const timestamp = new Date().toISOString()
  const username = getUsername(event)

  console.log(event.headers)
  console.log(event.requestContext)

  const {
    'checkout-reference': eventId = '',
    'checkout-status': queryStatus = '',
    'checkout-stamp': registrationId = '',
    'checkout-transaction-id': transactionId = '',
    signature,
  } = event.headers
  const checkoutHeaders = Object.fromEntries(Object.entries(event.headers).filter(([key]) => key.startsWith('checkout-')))

  if (calculateHmac(env.merchantSecret, checkoutHeaders) !== signature) { //!!!
    console.log('warn', 'Verifying Paytrail signature failed', event)

    throw new Error(`Payment verification failed with transaction id "${transactionId}"`)
  }

  let registration
  try {
    registration = await dynamoDB.read<JsonRegistration>({ eventId: eventId, id: registrationId })
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
      console.log('info', 'Payment already handled', { eventId, paymentStatus, paidAt, receiptSent, registrationId, transactionId })
  
      return response(200, registration)
    }
  
    registration.paymentStatus = queryStatus === 'ok' ? 'SUCCESS' : queryStatus === 'fail' ? 'CANCEL' : paymentStatus
    registration.paidAt = paymentStatus === 'SUCCESS' ? currentFinnishTime() : undefined 

    await dynamoDB.write(registration)

    /*
    * Send confirmation and receipt only from callback to avoid sending them twice in case
    * redirect and callback arrive nearly simultaneously.
    */
    if (registration.paidAt && !receiptSent && source === 'notification') {
      //!!!
      const receiptResult = await sendReceipt(registration, new Date(registration.paidAt).toLocaleDateString('fi'))
      registration.receiptSent = receiptResult.isOk()
    }

    await dynamoDB.write(registration)

    console.log('info', 'Registration state updated', { eventId, paymentStatus, paidAt, receiptSent, registrationId, transactionId })

    metricsSuccess(metrics, event.requestContext, 'handlePayment')
    return response(200, registration)
  } catch (err) {
    metricsError(metrics, event.requestContext, 'handlePayment')
    return response((err as AWSError).statusCode || 501, err)
  }
}

const redirectToFinish = async (event: APIGatewayProxyEvent, r: APIGatewayProxyResult) => {
  const origin = getOrigin(event)
  const registration = JSON.parse(r.body)
  // TODO Paths should probably be in a common place for both BE and FE
  const path = r.statusCode == 200 ? `${origin}/registration/${registration.eventType}/${registration.eventId}/${registration.id}` : `${origin}/` // TODO needs redirect to valid error page

  return redirect(registration, path)
}
