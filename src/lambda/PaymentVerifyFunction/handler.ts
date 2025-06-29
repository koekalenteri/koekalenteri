import type { JsonTransaction, VerifyPaymentResponse } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { parseParams, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
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

    if (status === 'error') {
      const registration = await getRegistration(eventId, registrationId)

      if (registration.paymentStatus === 'PENDING') {
        await dynamoDB.update(
          { eventId, id: registrationId },
          {
            set: {
              paymentStatus: 'CANCEL',
            },
          },
          CONFIG.registrationTable
        )

        const provider = params['checkout-provider']

        await audit({
          auditKey: registrationAuditKey(registration),
          message: `Maksu epäonnistui (${getProviderName(provider)}), ${formatMoney(transaction.amount / 100)}`,
          user: transaction.user ?? 'anonymous',
        })
      }
    }

    return response<VerifyPaymentResponse>(200, { status, paymentStatus, eventId, registrationId }, event)
  } catch (e) {
    console.error(e)
    return response<VerifyPaymentResponse>(200, { status: 'error', paymentStatus, eventId, registrationId }, event)
  }
})

export default paymentVerifyLambda
