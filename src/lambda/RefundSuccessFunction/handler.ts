import type { PaytrailCallbackParams } from '../types/paytrail'
import { LambdaError, lambda, response } from '../lib/lambda'
import { parseParams, verifyParams } from '../lib/payment'
import { paymentTransactionRepository } from '../payment/repository'
import { handleSuccessfulRefund } from '../refund/actions'

/**
 * refundSuccess is called by payment provider, to update successful refund status
 */
export const refundSuccessLambda = async (event: APIGatewayProxyEvent) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}

  await verifyParams(params)

  const { status, eventId, registrationId, transactionId } = parseParams(params)

  if (!status) {
    throw new LambdaError(400, 'Bad Request')
  }

  const transaction = await paymentTransactionRepository.getRefundById(transactionId!)

  if (transaction.statusAt && transaction.status === 'ok') {
    console.log('transaction already has status "ok", ignoring request')
    return response(200, undefined, event)
  }

  const updated = await paymentTransactionRepository.patchStatus(transaction, { status })
  if (updated && status === 'ok') {
    await handleSuccessfulRefund({
      eventId,
      params,
      provider: params['checkout-provider'],
      registrationId,
      transaction,
    })
  }

  return response(200, undefined, event)
}

export default lambda('refundSuccess', refundSuccessLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
