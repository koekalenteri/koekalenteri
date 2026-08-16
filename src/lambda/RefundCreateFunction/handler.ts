import type {
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonUser,
  Organizer,
  RefundPaymentResponse,
} from '../../types'
import type { RefundItem } from '../types/paytrail'
import { nanoid } from 'nanoid'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { LambdaError, lambda, response } from '../lib/lambda'
import { claimTransactionCreation, formatPaytrailErrorMessage, releaseTransactionCreation } from '../lib/payment'
import { PaytrailError, refundPayment } from '../lib/paytrail'
import { getRegistration } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { getApiHost } from '../utils/proxyEvent'

const { organizerTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)
const STALE_REFUND_CREATION_AGE_MS = 5 * 60 * 1000

const getData = async (transactionId: string, user: JsonUser, memberOf: string[]) => {
  const paymentTransaction = await dynamoDB.read<JsonPaymentTransaction>({ transactionId }, transactionTable)

  if (!paymentTransaction) {
    throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
  }

  const [eventId, registrationId] = paymentTransaction.reference.split(':')

  const jsonEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)

  const registration = await getRegistration(eventId, registrationId)

  const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
  if (!organizer?.paytrailMerchantId) {
    throw new LambdaError(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`)
  }

  return { eventId, paymentTransaction, registration, registrationId }
}

/**
 * refundCreate is called by client to refund a payment
 */
const refundCreateLambda = lambda('refundCreate', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

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

  const items: RefundItem[] | undefined = paymentItem && [
    {
      amount,
      refundReference: registrationId,
      refundStamp: nanoid(),
      stamp: paymentItem.stamp,
    },
  ]

  if (
    !(await claimTransactionCreation(dynamoDB, 'refund', eventId, registrationId, stamp, STALE_REFUND_CREATION_AGE_MS))
  ) {
    return response<string>(409, 'Refund already in progress', event)
  }

  let result: RefundPaymentResponse | undefined
  try {
    result = await refundPayment(
      getApiHost(event),
      transactionId,
      reference,
      stamp,
      items,
      // if there are no items, this is a full refund and needs amount provided.
      items ? undefined : amount,
      registration?.payer?.email
    )
  } catch (error: unknown) {
    await releaseTransactionCreation(dynamoDB, 'refund', eventId, registrationId, stamp)
    if (error instanceof PaytrailError) {
      const message = formatPaytrailErrorMessage('Maksun palautus', error)
      await audit({
        auditKey: registrationAuditKey(registration),
        message,
        user: user.name,
      })
      return response(error.status, { error: error.error, message }, event)
    }

    throw error
  }

  if (!result) {
    await releaseTransactionCreation(dynamoDB, 'refund', eventId, registrationId, stamp)
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
  const refundStatus = result.status === 'pending' || result.provider === 'email refund' ? 'PENDING' : 'SUCCESS'
  const updatedAt = new Date().toISOString()
  await dynamoDB.documentTransaction([
    {
      Put: {
        ConditionExpression: 'attribute_not_exists(transactionId)',
        Item: transaction,
        TableName: transactionTable,
      },
    },
    {
      Update: {
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: { '#status': 'refundStatus' },
        ExpressionAttributeValues: { ':status': refundStatus, ':updatedAt': updatedAt },
        Key: { eventId, id: registrationId },
        TableName: registrationTable,
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt REMOVE refundCreationAt, refundCreationStamp',
      },
    },
  ])

  if (result.status === 'pending' || result.provider === 'email refund') {
    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Palautus on kesken (${getProviderName(transaction.provider)}), ${formatMoney(amount / 100)}`,
      user: transaction.user,
    })
  }

  return response<RefundPaymentResponse>(200, result, event)
})

export default refundCreateLambda
