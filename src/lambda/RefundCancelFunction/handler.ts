import type { PaytrailCallbackParams } from '../types/paytrail'
import { formatMoney } from '../../lib/money'
import { audit, registrationAuditKey } from '../lib/audit'
import { lambda, response } from '../lib/lambda'
import { parseParams, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import { paymentTransactionRepository } from '../payment/repository'
import { createApplyRefundCancel } from '../registration/actions'
import { registrationRepository } from '../registration/repository'

const applyRefundCancel = createApplyRefundCancel(registrationRepository)

/**
 * refundCancel is called by payment provider, to update cancelled refund status
 */
export const refundCancelLambda = async (event: APIGatewayProxyEvent) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const { eventId, registrationId, transactionId } = parseParams(params)

  if (!params['checkout-transaction-id']) {
    console.log(
      'Request did not contain transaction-id, this happens when transaction was not actually created. Ignoring request.'
    )
    return response(200, undefined, event)
  }

  await verifyParams(params)

  const transaction = await paymentTransactionRepository.getRefundById(transactionId!)

  const registration = await getRegistration(eventId, registrationId)

  const updated = await paymentTransactionRepository.patchStatus(transaction, { status: 'fail' })
  if (updated) {
    if (registration.refundStatus === 'PENDING') {
      await applyRefundCancel({ eventId, registrationId })
    }

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Palautus epäonnistui (${transaction.provider}), ${formatMoney(transaction.amount / 100)}`,
      user: transaction.user,
    })
  } else {
    console.log(`Transaction '${transactionId}' already marked as failed`)
  }

  return response(200, undefined, event)
}

export default lambda('refundCancel', refundCancelLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
