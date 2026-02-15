import type { JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { i18n } from '../../i18n/lambda'
import { getCostSegmentName } from '../../lib/cost'
import { formatMoney } from '../../lib/money'
import { getProviderName, getRegistrationPaymentDetails } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { updateRegistrations } from '../lib/event'
import { lambda, response } from '../lib/lambda'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { frontendURL, emailFrom, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

const handleSuccessfulPayment = async (
  eventId: string,
  registrationId: string,
  params: Partial<PaytrailCallbackParams>,
  transaction: JsonTransaction,
  provider: string | undefined
) => {
  const registration = await getRegistration(eventId, registrationId)

  const t = i18n.getFixedT(registration.language)
  const paidAmount = Number.parseInt(params['checkout-amount'] ?? '0', 10) / 100

  const previouslyPaid = registration.paidAmount ?? 0
  registration.paidAmount = previouslyPaid + paidAmount
  registration.paidAt = new Date().toISOString()
  registration.paymentStatus = 'SUCCESS'
  registration.state = 'ready'

  // registration is paid after picked to the event, this also confirms the place.
  if (registration.messagesSent?.picked) {
    registration.confirmed = true
  }

  await dynamoDB.update(
    { eventId, id: registrationId },
    {
      set: {
        confirmed: registration.confirmed ?? false,
        paidAmount: registration.paidAmount,
        paidAt: registration.paidAt,
        paymentStatus: registration.paymentStatus,
        state: registration.state,
      },
    },
    registrationTable
  )

  const confirmedEvent = await updateRegistrations(registration.eventId)

  // send receipt
  try {
    const receiptTo: string[] = []
    if (registration.payer?.email) receiptTo.push(registration.payer?.email)

    const templateData = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, 'receipt')
    const paymentDetails = getRegistrationPaymentDetails(confirmedEvent, registration)
    const memberPrice = paymentDetails.isMember ? ` (${t('costForMembers')})` : ''
    const costSegmentName =
      paymentDetails.strategy === 'custom' && paymentDetails.costObject?.custom?.description?.fi
        ? paymentDetails.costObject.custom.description[registration.language] ||
          paymentDetails.costObject?.custom?.description?.fi
        : t(getCostSegmentName(paymentDetails.strategy), paymentDetails.translationOptions)
    const registrationCostName = `${costSegmentName}${memberPrice}`
    const registrationCost = `${formatMoney(paymentDetails.cost)}`
    const optionalCosts = paymentDetails.optionalCosts
      .map((o) => `${o.description[registration.language] || o.description.fi}${memberPrice} ${formatMoney(o.cost)}`)
      .join(', ')
    await sendTemplatedMail('receipt', registration.language, emailFrom, receiptTo, {
      ...templateData,
      ...transaction,
      amount: formatMoney(paidAmount),
      createdAt: t('dateFormat.long', { date: transaction.createdAt }),
      optionalCosts,
      previouslyPaid: previouslyPaid ? formatMoney(previouslyPaid) : undefined,
      registrationCost,
      registrationCostName,
      totalPaid: formatMoney(previouslyPaid + paidAmount),
    })

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Email: ${templateData.subject}, to: ${receiptTo.join(', ')}`,
      user: transaction.user ?? 'anonymous',
    })
  } catch (e) {
    // this is not fatal
    console.error('failed to send receipt', e)
  }

  await audit({
    auditKey: registrationAuditKey(registration),
    message: `Maksu (${getProviderName(provider)}), ${formatMoney(paidAmount)}`,
    user: transaction.user ?? 'anonymous',
  })

  if (confirmedEvent.paymentTime !== 'confirmation') {
    // send confirmation message
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

/**
 * paymentSuccess is called by payment provider, to update successful payment status
 */
const paymentSuccessLambda = lambda('paymentSuccess', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const { eventId, provider, registrationId, status, transactionId } = parseParams(params)

  await verifyParams(params)

  const transaction = await dynamoDB.read<JsonTransaction>({ transactionId })
  if (!transaction) throw new Error(`Transaction with id '${transactionId}' was not found`)

  const updated = await updateTransactionStatus(transaction, status, provider)
  if (updated && status === 'ok') {
    await handleSuccessfulPayment(eventId, registrationId, params, transaction, provider)
  }

  return response(200, undefined, event)
})

export default paymentSuccessLambda
