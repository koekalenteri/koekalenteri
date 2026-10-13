import type { JsonRefundTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { paymentAudit } from '../../lib/audit'
import { formatMoney } from '../../lib/money'
import { getProviderName, transactionActor } from '../../lib/payment'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { resolveCallbackTransaction, settleFailedTransaction } from '../lib/payment'
import { publishCancelledRegistration } from '../lib/ws/actions'

/**
 * refundCancel is called by payment provider, to update cancelled refund status
 */
const refundCancelLambda = lambda('refundCancel', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}

  if (!params['checkout-transaction-id']) {
    logger.info(
      'request did not contain transaction-id, this happens when transaction was not actually created, ignoring request'
    )
    return response(200, undefined, event)
  }

  const { registration, transaction } = await resolveCallbackTransaction<JsonRefundTransaction>(params)

  // The provider is not updated here, as before: only the status moves, read from the transaction's
  // own stored provider for the audit line (KOE-1529).
  const settled = await settleFailedTransaction(transaction, registration, 'openRefunds', {
    auditActor: transactionActor,
    auditMessage: (t) => paymentAudit('refundFailed', getProviderName(t.provider), formatMoney(t.amount / 100)),
  })

  if (settled.cancelled) await publishCancelledRegistration(settled.cancelled)

  return response(200, undefined, event)
})

export default refundCancelLambda
