import type { JsonTransaction, VerifyPaymentResponse } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { auditUser, paymentAudit } from '../../lib/audit'
import { formatMoney } from '../../lib/money'
import { getProviderName, transactionActor } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { cancelRegistrationStatus, parseParams, verifyParams } from '../lib/payment'
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
      if (registration.paymentStatus === 'PENDING') {
        // Written and sent on as the provider's cancel callback does: to the admins, and to the
        // participant's open page, which gets its pay button back without a reload (KOE-1526).
        await publishCancelledRegistration(await cancelRegistrationStatus(registration, 'paymentStatus'))

        const provider = params['checkout-provider']

        await audit({
          auditKey: registrationAuditKey(registration),
          ...paymentAudit('paymentFailed', getProviderName(provider), formatMoney(transaction.amount / 100)),
          ...auditUser(transactionActor(transaction)),
        })
      }
    }

    return response<VerifyPaymentResponse>(200, { editToken, eventId, paymentStatus, registrationId, status }, event)
  } catch (e) {
    logger.error('failed to verify payment', { error: e, eventId, registrationId })
    return response<VerifyPaymentResponse>(200, { eventId, paymentStatus, registrationId, status: 'error' }, event)
  }
})

export default paymentVerifyLambda
