import type { JsonConfirmedEvent, JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { getEvent } from '../lib/event'
import { LambdaError, lambda, response } from '../lib/lambda'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import { publishRegistrationPatches } from '../lib/ws/actions'
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
      const updatedAt = new Date().toISOString()
      await dynamoDB.update(
        { eventId, id: registrationId },
        {
          set: {
            paymentStatus: 'CANCEL',
            updatedAt,
          },
        },
        registrationTable
      )
      const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
      await publishRegistrationPatches(
        eventId,
        [{ eventId, id: registrationId, paymentStatus: 'CANCEL', updatedAt }],
        confirmedEvent.organizer.id
      )
    }

    await audit({
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
