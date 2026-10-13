import type { JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { paymentAudit } from '../../lib/audit'
import { formatMoney } from '../../lib/money'
import { getProviderName, transactionActor } from '../../lib/payment'
import { lambda, response } from '../lib/lambda'
import { resolveCallbackTransaction, settleFailedTransaction } from '../lib/payment'
import { publishCancelledRegistration } from '../lib/ws/actions'

/**
 * paymentCancel is called by payment provider, to update cancelled payment status
 */
const paymentCancelLambda = lambda('paymentCancel', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const { provider, registration, transaction } = await resolveCallbackTransaction<JsonTransaction>(params)

  const settled = await settleFailedTransaction(transaction, registration, 'openPayments', {
    auditActor: transactionActor,
    auditMessage: (t, p) => paymentAudit('paymentFailed', getProviderName(p), formatMoney(t.amount / 100)),
    provider,
  })

  if (settled.cancelled) await publishCancelledRegistration(settled.cancelled)

  return response(200, undefined, event)
})

export default paymentCancelLambda
