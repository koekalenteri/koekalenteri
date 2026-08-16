import type { JsonRefundTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { formatMoney } from '../../lib/money'
import { lambda, response } from '../lib/lambda'
import { cancelTransaction } from '../lib/payment'

/**
 * refundCancel is called by payment provider, to update cancelled refund status
 */
const refundCancelLambda = lambda('refundCancel', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}

  if (!params['checkout-transaction-id']) {
    console.log(
      'Request did not contain transaction-id, this happens when transaction was not actually created. Ignoring request.'
    )
    return response(200, undefined, event)
  }

  await cancelTransaction<JsonRefundTransaction>({
    auditMessage: (transaction) =>
      `Palautus epäonnistui (${transaction.provider}), ${formatMoney(transaction.amount / 100)}`,
    auditUser: (transaction) => transaction.user,
    params,
    statusField: 'refundStatus',
  })

  return response(200, undefined, event)
})

export default refundCancelLambda
