import type {
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonUser,
  RefundItem,
  RefundPaymentResponse,
  TransactionItem,
} from '../../types'
import { nanoid } from 'nanoid'
import { paymentAudit } from '../../lib/audit'
import { formatMoney } from '../../lib/money'
import { getProviderName, paytrailRefusalBody } from '../../lib/payment'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, LambdaError, lambda, response } from '../lib/lambda'
import { refundPaytrailErrorAudit } from '../lib/payment'
import { PaytrailError, paytrail } from '../lib/paytrail'
import { getRegistration } from '../lib/registration'
import { readOrganizer } from '../lib/repositories/organizerRepository'
import { claimTransactionCreation, releaseTransactionCreation } from '../lib/repositories/registrationRepository'
import { createRefundTransaction, readTransaction } from '../lib/repositories/transactionRepository'
import { getApiHost } from '../utils/proxyEvent'

const STALE_REFUND_CREATION_AGE_MS = 5 * 60 * 1000

const getData = async (transactionId: string, user: JsonUser, memberOf: string[]) => {
  const paymentTransaction = await readTransaction<JsonPaymentTransaction>(transactionId)

  if (!paymentTransaction) {
    throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
  }

  const [eventId, registrationId] = paymentTransaction.reference.split(':')

  const jsonEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)

  const registration = await getRegistration(eventId, registrationId)

  const organizer = await readOrganizer(jsonEvent.organizer.id)
  if (!organizer?.paytrailMerchantId) {
    throw new LambdaError(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`)
  }

  return { eventId, paymentTransaction, registration, registrationId }
}

/**
 * refundCreate is called by client to refund a payment
 */
const refundCreateLambda = lambda('refundCreate', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)

  const {
    transactionId,
    amount,
    handlingCost = 0,
  } = parseJSONWithFallback<{
    transactionId: string
    amount: number
    handlingCost?: number
  }>(event.body)

  if (amount <= 0) {
    throw new LambdaError(400, `Invalid amount: '${amount}'`)
  }

  const { paymentTransaction, eventId, registrationId, registration } = await getData(transactionId, user, memberOf)

  const reference = `${eventId}:${registrationId}`
  const stamp = nanoid()

  if (paymentTransaction.items && paymentTransaction.items.length !== 1) {
    throw new LambdaError(412, 'Unsupported transaction')
  }

  const paymentItem = paymentTransaction.items?.[0]

  // What is recorded on the refund transaction, and what Paytrail is asked to refund. `stamp` names
  // the payment line being refunded; the refund line gets a stamp of its own.
  const items: TransactionItem[] | undefined = paymentItem && [
    { amount, eventId, registrationId, stamp: paymentItem.stamp },
  ]
  const refundItems: RefundItem[] | undefined = items?.map((item) => ({
    amount,
    refundReference: registrationId,
    refundStamp: nanoid(),
    stamp: item.stamp,
  }))

  if (!(await claimTransactionCreation('refund', eventId, registrationId, stamp, STALE_REFUND_CREATION_AGE_MS))) {
    return response<string>(409, 'Refund already in progress', event)
  }

  let result: RefundPaymentResponse | undefined
  try {
    result = await paytrail.refundPayment(
      getApiHost(event),
      transactionId,
      reference,
      stamp,
      refundItems,
      // if there are no items, this is a full refund and needs amount provided.
      refundItems ? undefined : amount,
      registration?.payer?.email
    )
  } catch (error: unknown) {
    await releaseTransactionCreation('refund', eventId, registrationId, stamp)
    if (error instanceof PaytrailError) {
      await audit({
        auditKey: registrationAuditKey(registration),
        ...refundPaytrailErrorAudit(error),
        user: user.name,
      })
      // Paytrail's own words, marked as Paytrail's: the dialog puts them in the secretary's language
      // and tells them from this API's own errors, which also answer `{ error }` (KOE-1511).
      throw httpError(error.status, paytrailRefusalBody(error.error))
    }

    throw error
  }

  if (!result) {
    await releaseTransactionCreation('refund', eventId, registrationId, stamp)
    throw new LambdaError(500, 'refundPayment did not return a result')
  }

  const transaction: JsonRefundTransaction = {
    amount,
    createdAt: new Date().toISOString(),
    handlingCost,
    items,
    provider: result.provider,
    reference,
    stamp,
    status: result.status,
    transactionId: result.transactionId,
    type: 'refund',
    user: user.name,
  }
  // Every refund opens: it waits until applySuccessfulRefund (via the refundSuccess callback) or
  // settleFailedTransaction drops it again. `refundStatus` itself is written only for a synchronous,
  // already-settled refund (KOE-1529): PENDING is never written any more, and a pending or email
  // refund's own SUCCESS comes later, from applySuccessfulRefund, once it has actually been applied.
  const isPendingRefund = result.status === 'pending' || result.provider === 'email refund'
  await createRefundTransaction(transaction, eventId, registrationId, new Date().toISOString(), isPendingRefund)

  if (isPendingRefund) {
    await audit({
      auditKey: registrationAuditKey(registration),
      ...paymentAudit('refundPending', getProviderName(transaction.provider), formatMoney(amount / 100)),
      user: transaction.user,
    })
  }

  return response<RefundPaymentResponse>(200, result, event)
})

export default refundCreateLambda
