import type { JsonTransaction, VerifyPaymentResponse } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { paymentAudit } from '../../lib/audit'
import { formatMoney } from '../../lib/money'
import { getProviderName, transactionActor } from '../../lib/payment'
import { CONFIG } from '../config'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { cancelUnfinishedTransaction, parseParams, verifyParams } from '../lib/payment'
import { getRegistration, getRegistrationEditToken } from '../lib/registration'
import { publishCancelledRegistration } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.transactionTable)

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
    const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
    if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

    const status = paymentStatus === 'fail' ? 'error' : 'ok'
    const registration = await getRegistration(eventId, registrationId)
    const editToken = getRegistrationEditToken(registration)

    if (status === 'error') {
      // The signed return says the payment failed: cancelled as the provider's cancel callback would,
      // in the one step they share (KOE-1526). The transaction fails, so the payment page does not
      // reuse it; a PENDING registration is cancelled and sent on to the admins and to the
      // participant's open page; and the one cancel is audited once, whichever comes first.
      const cancelled = await cancelUnfinishedTransaction({
        auditActor: transactionActor,
        auditMessage: (failed, provider) =>
          paymentAudit('paymentFailed', getProviderName(provider), formatMoney(failed.amount / 100)),
        provider: params['checkout-provider'],
        registration,
        statusField: 'paymentStatus',
        transaction,
        updateProvider: true,
      })
      if (cancelled) await publishCancelledRegistration(cancelled)
    }

    return response<VerifyPaymentResponse>(200, { editToken, eventId, paymentStatus, registrationId, status }, event)
  } catch (e) {
    logger.error('failed to verify payment', { error: e, eventId, registrationId })
    return response<VerifyPaymentResponse>(200, { eventId, paymentStatus, registrationId, status: 'error' }, event)
  }
})

export default paymentVerifyLambda
