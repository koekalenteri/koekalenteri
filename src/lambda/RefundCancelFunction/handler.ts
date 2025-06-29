import type { JsonRefundTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { formatMoney } from '../../lib/money'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { lambda, LambdaError, response } from '../lib/lambda'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * refundCancel is called by payment provider, to update cancelled refund status
 */
const refundCancelLambda = lambda('refundCancel', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const { eventId, registrationId, transactionId } = parseParams(params)

  if (!params['checkout-transaction-id']) {
    console.log(
      'Request did not contain transaction-id, this happens when transaction was not actually created. Ignoring request.'
    )
    return response(200, undefined, event)
  }

  await verifyParams(params)

  const transaction = await dynamoDB.read<JsonRefundTransaction>({ transactionId })
  if (!transaction) {
    throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
  }

  const registration = await getRegistration(eventId, registrationId)

  const updated = await updateTransactionStatus(transaction, 'fail')
  if (updated) {
    if (registration.refundStatus === 'PENDING') {
      await dynamoDB.update(
        { eventId, id: registrationId },
        {
          set: {
            refundStatus: 'CANCEL',
          },
        },
        registrationTable
      )
    }

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Palautus epäonnistui (${transaction.provider}), ${formatMoney(transaction.amount / 100)}`,
      user: transaction.user,
    })
  } else {
    console.log(`Transaction '${transactionId}' already marked as failed`)
  }

  return response(200, undefined, event)
})

export default refundCancelLambda
