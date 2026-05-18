import type { JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { i18n } from '../../i18n/lambda'
import { getCostSegmentName } from '../../lib/cost'
import { formatMoney } from '../../lib/money'
import { getProviderName, getRegistrationPaymentDetails } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { applyPaymentSuccessWithSideEffects } from '../registration/actions'

const { emailFrom, frontendURL } = CONFIG

type HandleSuccessfulPaymentInput = {
  eventId: string
  registrationId: string
  params: Partial<PaytrailCallbackParams>
  transaction: JsonTransaction
  provider: string | undefined
}

export const handleSuccessfulPayment = async ({
  eventId,
  params,
  provider,
  registrationId,
  transaction,
}: HandleSuccessfulPaymentInput): Promise<void> => {
  const paidAmount = Number.parseInt(params['checkout-amount'] ?? '0', 10) / 100
  const paidAt = new Date().toISOString()

  const {
    event: confirmedEvent,
    previous,
    registration,
  } = await applyPaymentSuccessWithSideEffects({
    eventId,
    paidAmount,
    paidAt,
    registrationId,
  })
  const previouslyPaid = previous.paidAmount ?? 0
  const t = i18n.getFixedT(registration.language)

  try {
    const receiptTo: string[] = []
    if (registration.payer?.email) receiptTo.push(registration.payer.email)

    const templateData = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, 'receipt')
    const paymentDetails = getRegistrationPaymentDetails(confirmedEvent, registration)
    const language: 'fi' | 'en' = registration.language === 'en' ? 'en' : 'fi'
    const memberPrice = paymentDetails.isMember ? ` (${t('costForMembers')})` : ''
    const costSegmentName =
      paymentDetails.strategy === 'custom' && paymentDetails.costObject?.custom?.description?.fi
        ? paymentDetails.costObject.custom.description[language] || paymentDetails.costObject.custom.description.fi
        : t(getCostSegmentName(paymentDetails.strategy), paymentDetails.translationOptions)

    await sendTemplatedMail('receipt', registration.language, emailFrom, receiptTo, {
      ...templateData,
      ...transaction,
      amount: formatMoney(paidAmount),
      createdAt: t('dateFormat.long', { date: transaction.createdAt }),
      optionalCosts: paymentDetails.optionalCosts
        .map((o) => `${o.description[language] || o.description.fi}${memberPrice} ${formatMoney(o.cost)}`)
        .join(', '),
      previouslyPaid: previouslyPaid ? formatMoney(previouslyPaid) : undefined,
      registrationCost: formatMoney(paymentDetails.cost),
      registrationCostName: `${costSegmentName}${memberPrice}`,
      totalPaid: formatMoney(previouslyPaid + paidAmount),
    })

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Email: ${templateData.subject}, to: ${receiptTo.join(', ')}`,
      user: transaction.user ?? 'anonymous',
    })
  } catch (e) {
    console.error('failed to send receipt', e)
  }

  await audit({
    auditKey: registrationAuditKey(registration),
    message: `Maksu (${getProviderName(provider)}), ${formatMoney(paidAmount)}`,
    user: transaction.user ?? 'anonymous',
  })

  if (confirmedEvent.paymentTime !== 'confirmation') {
    const to = emailTo(registration)
    const data = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, '')
    await sendTemplatedMail('registration', registration.language, emailFrom, to, data)

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Email: ${data.subject}, to: ${to.join(', ')}`,
      user: transaction.user ?? 'anonymous',
    })
  }
}
