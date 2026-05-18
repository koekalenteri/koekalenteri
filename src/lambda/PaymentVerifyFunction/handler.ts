import type { VerifyPaymentResponse } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { audit, registrationAuditKey } from '../lib/audit'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { parseParams, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import { paymentTransactionRepository } from '../payment/repository'
import { createApplyPaymentCancel } from '../registration/actions'
import { registrationRepository } from '../registration/repository'

const applyPaymentCancel = createApplyPaymentCancel(registrationRepository)

/**
 * paymentVerify is called by client when returning from payment provider.
 */
export const paymentVerifyLambda = async (event: APIGatewayProxyEvent) => {
  const params: Partial<PaytrailCallbackParams> = parseJSONWithFallback(event.body)
  const { eventId, registrationId, transactionId, status: paymentStatus } = parseParams(params)

  try {
    await verifyParams(params)

    /**
     * NB: the stored transaction status is probably outdated, since its updated by callback from the payment provider.
     */
    const transaction = await paymentTransactionRepository.getById(transactionId!)
    if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

    const status = paymentStatus === 'fail' ? 'error' : 'ok'

    if (status === 'error') {
      const registration = await getRegistration(eventId, registrationId)

      if (registration.paymentStatus === 'PENDING') {
        await applyPaymentCancel({ eventId, registrationId })

        const provider = params['checkout-provider']

        await audit({
          auditKey: registrationAuditKey(registration),
          message: `Maksu epäonnistui (${getProviderName(provider)}), ${formatMoney(transaction.amount / 100)}`,
          user: transaction.user ?? 'anonymous',
        })
      }
    }

    return response<VerifyPaymentResponse>(200, { eventId, paymentStatus, registrationId, status }, event)
  } catch (e) {
    console.error(e)
    return response<VerifyPaymentResponse>(200, { eventId, paymentStatus, registrationId, status: 'error' }, event)
  }
}

export default lambda('paymentVerify', paymentVerifyLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
