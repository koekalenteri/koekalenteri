import type { JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { formatMoney } from '../../lib/money'
import { getProviderName, transactionActor } from '../../lib/payment'
import { lambda, response } from '../lib/lambda'
import { cancelTransaction } from '../lib/payment'
import { publishCancelledRegistration } from '../lib/ws/actions'

/**
 * paymentCancel is called by payment provider, to update cancelled payment status
 */
const paymentCancelLambda = lambda('paymentCancel', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const cancelled = await cancelTransaction<JsonTransaction>({
    auditActor: transactionActor,
    auditMessage: (transaction, provider) =>
      `Maksu epäonnistui (${getProviderName(provider)}), ${formatMoney(transaction.amount / 100)}`,
    params,
    statusField: 'paymentStatus',
    updateProvider: true,
  })

  if (cancelled) await publishCancelledRegistration(cancelled)

  return response(200, undefined, event)
})

export default paymentCancelLambda
