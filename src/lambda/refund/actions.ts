import type { JsonPaymentTransaction, JsonRefundTransaction, JsonRegistration } from '../../types'
import type { PaymentTransactionRepository } from '../payment/repository'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { i18n } from '../../i18n/lambda'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { applyRefundSuccess } from '../registration/actions'
import { eventReadPort } from '../registration/api'

const { frontendURL, emailFrom } = CONFIG

// ---------------------------------------------------------------------------
// loadRefundRequestData
// ---------------------------------------------------------------------------

type RefundRequestInput = {
  transactionId: string
}

type RefundRequestData = {
  eventId: string
  registrationId: string
  registration: JsonRegistration
  paymentTransaction: JsonPaymentTransaction
}

type RefundRequestDependencies = {
  refundRepo: PaymentTransactionRepository
  registrationRead: { getById(eventId: string, id: string): Promise<JsonRegistration | undefined> }
}

export const createLoadRefundRequestData =
  ({ refundRepo, registrationRead }: RefundRequestDependencies) =>
  async ({ transactionId }: RefundRequestInput): Promise<RefundRequestData> => {
    const paymentTransaction = await refundRepo.getPaymentById(transactionId)
    const [eventId, registrationId] = paymentTransaction.reference.split(':')
    const registration = await registrationRead.getById(eventId, registrationId)

    return {
      eventId,
      paymentTransaction,
      registration: registration as JsonRegistration,
      registrationId,
    }
  }

// ---------------------------------------------------------------------------
// handleSuccessfulRefund
// ---------------------------------------------------------------------------

type HandleSuccessfulRefundInput = {
  eventId: string
  registrationId: string
  params: Partial<PaytrailCallbackParams>
  provider: string | undefined
  transaction: JsonRefundTransaction
}

export const handleSuccessfulRefund = async ({
  eventId,
  params,
  provider,
  registrationId,
  transaction,
}: HandleSuccessfulRefundInput): Promise<void> => {
  const amount = Number.parseInt(params['checkout-amount'] ?? '0', 10) / 100
  const providerName = getProviderName(provider)
  const refundAt = new Date().toISOString()

  const { registration } = await applyRefundSuccess({
    eventId,
    refundAmount: amount,
    refundAt,
    registrationId,
  })

  const t = i18n.getFixedT(registration.language)
  const confirmedEvent = await eventReadPort.getConfirmedEvent(eventId)

  try {
    const recipient: string[] = []
    if (registration.payer?.email) recipient.push(registration.payer?.email)

    const emailData = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, 'refund')
    await sendTemplatedMail('refund', registration.language, emailFrom, recipient, {
      ...emailData,
      ...transaction,
      amount: formatMoney(amount),
      createdAt: t('dateFormat.long', { date: transaction.createdAt }),
      handlingCost: formatMoney(Math.max(0, (registration.paidAmount ?? 0) - amount)),
      paidAmount: formatMoney(registration.paidAmount ?? 0),
      providerName,
      refundAmount: registration.refundAmount,
      refundAt: t('dateFormat.long', { date: refundAt }),
      refundStatus: registration.refundStatus,
    })

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Email: ${emailData.subject}, to: ${recipient.join(', ')}`,
      user: transaction.user,
    })
  } catch (e) {
    console.error('failed to send refund email', e)
  }

  await audit({
    auditKey: registrationAuditKey(registration),
    message: `Palautus (${providerName}), ${formatMoney(amount)}`,
    user: transaction.user,
  })
}
