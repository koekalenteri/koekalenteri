import type { JsonRefundTransaction, RefundPaymentResponse } from '../../types'
import type { RefundItem } from '../types/paytrail'
import { nanoid } from 'nanoid'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { authorize } from '../auth/api'
import { audit, registrationAuditKey } from '../lib/audit'
import { parseJSONWithFallback } from '../lib/json'
import { LambdaError, lambda, response } from '../lib/lambda'
import { refundPayment } from '../lib/paytrail'
import { getRegistration } from '../lib/registration'
import { organizerReadPort } from '../organizer/api'
import { paymentTransactionRepository } from '../payment/repository'
import { createLoadRefundRequestData } from '../refund/actions'
import { applyRefundCreate } from '../registration/actions'
import { eventReadPort } from '../registration/api'
import { getApiHost } from '../utils/proxyEvent'

const loadRefundRequestData = createLoadRefundRequestData({
  refundRepo: {
    getPaymentTransaction: paymentTransactionRepository.getPaymentById,
    writeRefundTransaction: paymentTransactionRepository.createRefund,
  },
  registrationRead: {
    async getById(eventId, id) {
      return getRegistration(eventId, id)
    },
  },
})

/**
 * refundCreate is called by client to refund a payment
 */
export const refundCreateLambda = async (event: APIGatewayProxyEvent) => {
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

  const { paymentTransaction, eventId, registrationId, registration } = await loadRefundRequestData({ transactionId })

  const jsonEvent = await eventReadPort.getConfirmedEvent(eventId)
  await organizerReadPort.getWithMerchantId(jsonEvent.organizer.id)

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

  const result = await refundPayment(
    getApiHost(event),
    transactionId,
    reference,
    stamp,
    items,
    // if there are no items, this is a full refund and needs amount provided.
    items ? undefined : amount,
    registration?.payer?.email
  )

  if (!result) {
    throw new LambdaError(500, 'refundPayment did not return a result')
  }

  const isPending = result.status === 'pending' || result.provider === 'email refund'

  const refundTransaction: JsonRefundTransaction = {
    amount,
    createdAt: new Date().toISOString(),
    items,
    provider: result.provider,
    reference,
    stamp,
    status: result.status,
    transactionId: result.transactionId,
    type: 'refund',
    user: user.name,
  }
  await paymentTransactionRepository.createRefund(refundTransaction)

  // Apply the pending refund state transition through the domain action boundary
  await applyRefundCreate({ eventId, isPending, registrationId })

  if (isPending) {
    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Palautus on kesken (${getProviderName(refundTransaction.provider)}), ${formatMoney(amount / 100)}`,
      user: refundTransaction.user,
    })
  }

  return response<RefundPaymentResponse>(200, result, event)
}

export default lambda('refundCreate', refundCreateLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
