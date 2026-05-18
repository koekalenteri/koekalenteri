import type { PaytrailCallbackParams } from '../types/paytrail'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { audit, registrationAuditKey } from '../lib/audit'
import { lambda, response } from '../lib/lambda'
import { parseParams, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import { paymentTransactionRepository } from '../payment/repository'
import { createApplyPaymentCancel } from '../registration/actions'
import { registrationRepository } from '../registration/repository'

const applyPaymentCancel = createApplyPaymentCancel(registrationRepository)

/**
 * paymentCancel is called by payment provider, to update cancelled payment status
 */
export const paymentCancelLambda = async (event: APIGatewayProxyEvent) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const { eventId, provider, registrationId, transactionId } = parseParams(params)

  await verifyParams(params)

  const transaction = await paymentTransactionRepository.getPaymentById(transactionId!)

  const registration = await getRegistration(eventId, registrationId)

  const updated = await paymentTransactionRepository.patchStatus(transaction, { provider, status: 'fail' })
  if (updated) {
    await applyPaymentCancel({ eventId, registrationId })

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Maksu epäonnistui (${getProviderName(provider)}), ${formatMoney(transaction.amount / 100)}`,
      user: transaction.user ?? 'anonymous',
    })
  } else {
    console.log(`Transaction '${transactionId}' already marked as failed`)
  }

  return response(200, undefined, event)
}

export default lambda('paymentCancel', paymentCancelLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
