import type { PaytrailCallbackParams } from '../types/paytrail'
import { lambda, response } from '../lib/lambda'
import { parseParams, verifyParams } from '../lib/payment'
import { handleSuccessfulPayment } from '../payment/actions'
import { paymentTransactionRepository } from '../payment/repository'

/**
 * paymentSuccess is called by payment provider, to update successful payment status
 */
export const paymentSuccessLambda = async (event: APIGatewayProxyEvent) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const { eventId, provider, registrationId, status, transactionId } = parseParams(params)

  await verifyParams(params)

  const transaction = await paymentTransactionRepository.getPaymentById(transactionId!)

  if (!status) return response(200, undefined, event)
  const updated = await paymentTransactionRepository.patchStatus(transaction, { provider, status })
  if (updated && status === 'ok') {
    await handleSuccessfulPayment({ eventId, params, provider, registrationId, transaction })
  }

  return response(200, undefined, event)
}

export default lambda('paymentSuccess', paymentSuccessLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
