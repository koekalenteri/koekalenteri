import type { JsonConfirmedEvent, JsonRefundTransaction, JsonRegistration } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { getFixedT } from '../../i18n/lambda'
import { emailSentAudit, emailSubjectAuditKey, paymentAudit } from '../../lib/audit'
import { formatMoney } from '../../lib/money'
import { getProviderName, transactionActor } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { getEvent } from '../lib/event'
import { LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import {
  applySuccessfulRefund,
  parseParams,
  publishParticipantPayments,
  settleFailedTransaction,
  updateTransactionStatus,
  verifyParams,
} from '../lib/payment'
import { clearRegistrationEmailDeliveryStatus, getRegistration, getRegistrationEditToken } from '../lib/registration'
import { publishCancelledRegistration, publishRegistrationPatches } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { frontendURL, emailFrom, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * refundSuccess is called by payment provider, to update successful refund status
 */
const refundSuccessLambda = lambda('refundSuccess', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}

  await verifyParams(params)

  const { status, eventId, registrationId, transactionId } = parseParams(params)

  if (!status) {
    throw new LambdaError(400, 'Bad Request')
  }
  if (!transactionId) throw new LambdaError(400, 'Missing transaction id')

  const storedTransaction = await dynamoDB.read<JsonRefundTransaction>({ transactionId })
  const callbackAmount = Number.parseInt(params['checkout-amount'] ?? '', 10)
  if (!storedTransaction && status !== 'ok') {
    throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
  }
  if (!Number.isInteger(callbackAmount) || callbackAmount <= 0) {
    throw new LambdaError(400, `Transaction '${transactionId}' callback amount is invalid`)
  }
  const transaction: JsonRefundTransaction = storedTransaction ?? {
    amount: callbackAmount,
    createdAt: new Date().toISOString(),
    reference: `${eventId}:${registrationId}`,
    stamp: params['checkout-stamp'] ?? transactionId,
    status: 'new',
    transactionId,
    type: 'refund',
    user: 'unknown',
  }

  if (transaction.registrationAppliedAt) {
    logger.info('transaction already has status ok, ignoring request', { transactionId })
    return response(200, undefined, event)
  }

  const reference = `${eventId}:${registrationId}`
  if (transaction.reference !== reference) {
    throw new LambdaError(400, `Transaction '${transactionId}' does not belong to registration '${reference}'`)
  }
  if (callbackAmount !== transaction.amount) {
    throw new LambdaError(400, `Transaction '${transactionId}' callback amount does not match the stored amount`)
  }

  const registration = await getRegistration(eventId, registrationId)
  const editToken = getRegistrationEditToken(registration)

  if (status === 'fail') {
    // Settled through the same step every other failure writer uses (KOE-1529).
    const settled = await settleFailedTransaction(transaction, registration, 'openRefunds', {
      auditActor: transactionActor,
      auditMessage: (t, p) => paymentAudit('refundFailed', getProviderName(p), formatMoney(t.amount / 100)),
      provider: params['checkout-provider'],
    })
    if (settled.cancelled) await publishCancelledRegistration(settled.cancelled)
    return response(200, undefined, event)
  }

  if (status !== 'ok') {
    await updateTransactionStatus(transaction, status)
    return response(200, undefined, event)
  }

  const { applied, appliedAt } = await applySuccessfulRefund(
    transaction,
    eventId,
    registrationId,
    Boolean(storedTransaction)
  )
  if (!applied) return response(200, undefined, event)

  // Strongly consistent, the same convention settleFailedTransaction uses: applySuccessfulRefund
  // just DELETEd this transaction's id from openRefunds in the same atomic write, and the admin
  // patch below must say so, or an open tab keeps showing "palautus kesken" until a reload
  // (KOE-1529).
  const updatedRegistration = await dynamoDB.read<JsonRegistration>(
    { eventId, id: registrationId },
    registrationTable,
    true
  )

  const t = getFixedT(registration.language)
  const amount = transaction.amount / 100
  const provider = params['checkout-provider']
  const providerName = getProviderName(provider)

  const handlingCost = (transaction.handlingCost ?? 0) / 100
  const changes: Required<Pick<JsonRegistration, 'refundAmount' | 'refundAt' | 'refundStatus'>> &
    Pick<JsonRegistration, 'refundHandlingCost'> = {
    refundAmount: (registration.refundAmount ?? 0) + amount,
    refundAt: appliedAt,
    refundHandlingCost: (registration.refundHandlingCost ?? 0) + handlingCost,
    refundStatus: 'SUCCESS',
  }
  const updatedAt = changes.refundAt

  registration.refundAmount = (registration.refundAmount ?? 0) + amount
  registration.refundAt = changes.refundAt
  registration.refundHandlingCost = changes.refundHandlingCost
  registration.refundStatus = 'SUCCESS'
  registration.updatedAt = updatedAt

  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)

  // send refund notification
  try {
    const recipient: string[] = []
    if (registration.payer?.email) recipient.push(registration.payer?.email)

    const templateData = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, 'refund', editToken)
    await clearRegistrationEmailDeliveryStatus(eventId, registrationId)
    await sendTemplatedMail(
      'refund',
      registration.language,
      emailFrom,
      recipient,
      {
        ...templateData,
        ...transaction,
        ...changes,
        amount: formatMoney(amount),
        createdAt: t('dateFormat.long', { date: transaction.createdAt }),
        // The fee this refund kept, as the secretary set it: what was paid less what went back is
        // not it, since a partial refund leaves the rest of the payment standing (KOE-1459).
        handlingCost: formatMoney(handlingCost),
        paidAmount: formatMoney(registration.paidAmount ?? 0),
        providerName,
        refundAt: t('dateFormat.long', { date: registration.refundAt }),
      },
      registrationEmailTags(registration, 'refund')
    )

    await audit({
      auditKey: registrationAuditKey(registration),
      // There is no refund subject: the context falls back to the plain one, and so does the key.
      ...emailSentAudit(emailSubjectAuditKey(), recipient, templateData.subject),
      user: transaction.user,
    })
  } catch (e) {
    // this is not fatal
    logger.error('failed to send refund email', { error: e, transactionId })
  }

  await audit({
    auditKey: registrationAuditKey(registration),
    ...paymentAudit('refund', providerName, formatMoney(amount)),
    user: transaction.user,
  })
  await publishRegistrationPatches(
    eventId,
    [
      {
        emailDeliveryStatus: null,
        eventId,
        id: registrationId,
        openRefunds: updatedRegistration?.openRefunds,
        ...changes,
        updatedAt,
      },
    ],
    confirmedEvent.organizer.id
  )
  // The entrant's page learns the refund too, from the row as it stands after the write; a failed
  // push is logged and never fails the callback (KOE-1553).
  await publishParticipantPayments(confirmedEvent, [registrationId])

  return response(200, undefined, event)
})

export default refundSuccessLambda
