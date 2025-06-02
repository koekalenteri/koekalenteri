import type { JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { lambda, LambdaError, response } from '../lib/lambda'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * paymentCancel is called by payment provider, to update cancelled payment status
 */
const paymentCancelLambda = lambda('paymentCancel', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const { eventId, provider, registrationId, transactionId } = parseParams(params)

  await verifyParams(params)

  const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
  if (!transaction) throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)

  const registration = await getRegistration(eventId, registrationId)

  const updated = await updateTransactionStatus(transaction, 'fail', provider)
  if (updated) {
    if (registration.paymentStatus === 'PENDING') {
      await dynamoDB.update(
        { eventId, id: registrationId },
        {
          set: {
            paymentStatus: 'CANCEL',
          },
        },
        registrationTable
      )
    }

    audit({
      auditKey: registrationAuditKey(registration),
      message: `Maksu epäonnistui (${getProviderName(provider)}), ${formatMoney(transaction.amount / 100)}`,
      user: transaction.user ?? 'anonymous',
    })
  } else {
    console.log(`Transaction '${transactionId}' already marked as failed`)
  }

  return response(200, undefined, event)
})

export default paymentCancelLambda
