import type { VerifyPaymentResponse } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { paymentAudit } from '../../lib/audit'
import { formatMoney } from '../../lib/money'
import { getProviderName, transactionActor } from '../../lib/payment'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { parseParams, publishCancelledRegistration, settleFailedTransaction, verifyParams } from '../lib/payment'
import { getRegistration, getRegistrationEditToken } from '../lib/registration'
import { readTransaction } from '../lib/repositories/transactionRepository'

/**
 * paymentVerify is called by client when returning from payment provider.
 */
const paymentVerifyLambda = lambda('paymentVerify', async (event) => {
  const params: Partial<PaytrailCallbackParams> = parseJSONWithFallback(event.body)
  const { eventId, registrationId, transactionId, status: paymentStatus } = parseParams(params)

  try {
    await verifyParams(params)

    /**
     * NB: the stored transaction status is probably outdated, since its updated by callback from the payment provider.
     */
    const transaction = await readTransaction(transactionId)
    if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

    const status = paymentStatus === 'fail' ? 'error' : 'ok'
    const registration = await getRegistration(eventId, registrationId)
    const editToken = getRegistrationEditToken(registration)

    if (status === 'error') {
      // Settled through the same step the provider's cancel callback uses: whichever of the two
      // reaches it first writes the row and publishes, the other finds nothing left to change
      // (KOE-1526, KOE-1529). The open page gets its pay button back without a reload.
      const settled = await settleFailedTransaction(transaction, registration, 'openPayments', {
        auditActor: transactionActor,
        auditMessage: (t, p) => paymentAudit('paymentFailed', getProviderName(p), formatMoney(t.amount / 100)),
        provider: params['checkout-provider'],
      })
      if (settled.cancelled) await publishCancelledRegistration(settled.cancelled)
    }

    return response<VerifyPaymentResponse>(200, { editToken, eventId, paymentStatus, registrationId, status }, event)
  } catch (e) {
    logger.error('failed to verify payment', { error: e, eventId, registrationId })
    return response<VerifyPaymentResponse>(200, { eventId, paymentStatus, registrationId, status: 'error' }, event)
  }
})

export default paymentVerifyLambda
