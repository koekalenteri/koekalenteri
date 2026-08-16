import type { JsonConfirmedEvent, JsonRefundTransaction, JsonRegistration } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { i18n } from '../../i18n/lambda'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { getEvent } from '../lib/event'
import { LambdaError, lambda, response } from '../lib/lambda'
import { applySuccessfulRefund, parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import { clearRegistrationEmailDeliveryStatus, getRegistration, getRegistrationEditToken } from '../lib/registration'
import { publishRegistrationPatches } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { frontendURL, emailFrom, transactionTable } = CONFIG
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
    console.log('transaction already has status "ok", ignoring request')
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
  const editToken = await getRegistrationEditToken(registration)

  if (status === 'ok') {
    const { applied, appliedAt } = await applySuccessfulRefund(
      transaction,
      eventId,
      registrationId,
      Boolean(storedTransaction)
    )
    if (!applied) return response(200, undefined, event)

    const t = i18n.getFixedT(registration.language)
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
          handlingCost: formatMoney(Math.max(0, (registration.paidAmount ?? 0) - amount)),
          paidAmount: formatMoney(registration.paidAmount ?? 0),
          providerName,
          refundAt: t('dateFormat.long', { date: registration.refundAt }),
        },
        registrationEmailTags(registration, 'refund')
      )

      await audit({
        auditKey: registrationAuditKey(registration),
        message: `Email: ${templateData.subject}, to: ${recipient.join(', ')}`,
        user: transaction.user,
      })
    } catch (e) {
      // this is not fatal
      console.error('failed to send refund email', e)
    }

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Palautus (${providerName}), ${formatMoney(amount)}`,
      user: transaction.user,
    })
    await publishRegistrationPatches(
      eventId,
      [{ emailDeliveryStatus: null, eventId, id: registrationId, ...changes, updatedAt }],
      confirmedEvent.organizer.id
    )
  } else {
    await updateTransactionStatus(transaction, status)
  }

  return response(200, undefined, event)
})

export default refundSuccessLambda
