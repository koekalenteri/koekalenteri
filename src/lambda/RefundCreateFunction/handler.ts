import type {
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  Organizer,
  RefundPaymentResponse,
} from '../../types'
import type { RefundItem } from '../types/paytrail'

import { nanoid } from 'nanoid'

import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, LambdaError } from '../lib/lambda'
import { refundPayment } from '../lib/paytrail'
import { getRegistration } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { getApiHost } from '../utils/proxyEvent'
import { response } from '../utils/response'

const { organizerTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

const getData = async (transactionId: string) => {
  const paymentTransaction = await dynamoDB.read<JsonPaymentTransaction>({ transactionId }, transactionTable)

  if (!paymentTransaction) {
    throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
  }

  const [eventId, registrationId] = paymentTransaction.reference.split(':')

  const jsonEvent = await getEvent<JsonConfirmedEvent>(eventId)
  const registration = await getRegistration(eventId, registrationId)

  const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
  if (!organizer?.paytrailMerchantId) {
    throw new LambdaError(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`)
  }

  return { paymentTransaction, eventId, registration, registrationId }
}

/**
 * refundCreate is called by client to refund a payment
 */
const refundCreateLambda = lambda('refundCreate', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const { transactionId, amount } = parseJSONWithFallback<{
    transactionId: string
    amount: number
  }>(event.body)

  if (amount <= 0) {
    throw new LambdaError(400, `Invalid amount: '${amount}'`)
  }

  const { paymentTransaction, eventId, registrationId, registration } = await getData(transactionId)

  const reference = `${eventId}:${registrationId}`
  const stamp = nanoid()

  if (paymentTransaction.items && paymentTransaction.items.length !== 1) {
    throw new LambdaError(412, 'Unsupported transaction')
  }

  const paymentItem = paymentTransaction.items?.[0]

  const items: RefundItem[] | undefined = paymentItem && [
    {
      amount,
      stamp: paymentItem.stamp,
      refundStamp: nanoid(),
      refundReference: registrationId,
    },
  ]

  const result = await refundPayment(
    getApiHost(event),
    transactionId,
    reference,
    stamp,
    items,
    // if there are no items, this is a full refund and needs amount provided.
    items ? undefined : amount,
    registration?.payer.email
  )

  if (!result) {
    throw new LambdaError(500, 'refundPayment did not return a result')
  }

  const transaction: JsonRefundTransaction = {
    transactionId: result.transactionId,
    status: result.status,
    amount,
    reference,
    provider: result.provider,
    type: 'refund',
    stamp,
    items,
    createdAt: new Date().toISOString(),
    user: user.name,
  }
  await dynamoDB.write(transaction)

  await dynamoDB.update(
    { eventId, id: registrationId },
    'set #refundStatus = :refundStatus',
    { '#refundStatus': 'refundStatus' },
    {
      ':refundStatus': result.status === 'pending' || result.provider === 'email refund' ? 'PENDING' : 'SUCCESS',
    },
    registrationTable
  )

  if (result.status === 'pending' || result.provider === 'email refund') {
    audit({
      auditKey: registrationAuditKey(registration),
      message: `Palautus on kesken (${getProviderName(transaction.provider)}), ${formatMoney(amount / 100)}`,
      user: transaction.user,
    })
  }

  return response<RefundPaymentResponse>(200, result, event)
})

export default refundCreateLambda
