import type { JsonConfirmedEvent, JsonRefundTransaction, JsonRegistration } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'

import { i18n } from '../../i18n/lambda'
import { formatMoney } from '../../lib/money'
import { getProviderName } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { getEvent } from '../lib/event'
import { lambda, LambdaError, response } from '../lib/lambda'
import { parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import { getRegistration } from '../lib/registration'
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

  const transaction = await dynamoDB.read<JsonRefundTransaction>({ transactionId })
  if (!transaction) {
    throw new LambdaError(404, `Transaction with id '${transactionId}' was not found`)
  }

  if (transaction.statusAt && transaction.status === 'ok') {
    console.log('transaction already has status "ok", ignoring request')
    return response(200, undefined, event)
  }

  const registration = await getRegistration(eventId, registrationId)

  const updated = await updateTransactionStatus(transaction, status)
  if (updated && status === 'ok') {
    const t = i18n.getFixedT(registration.language)
    const amount = parseInt(params['checkout-amount'] ?? '0') / 100
    const provider = params['checkout-provider']
    const providerName = getProviderName(provider)

    const changes: Required<Pick<JsonRegistration, 'refundAmount' | 'refundAt' | 'refundStatus'>> = {
      refundAmount: (registration.refundAmount ?? 0) + amount,
      refundAt: new Date().toISOString(),
      refundStatus: 'SUCCESS',
    }

    await dynamoDB.update(
      { eventId, id: registrationId },
      {
        set: {
          refundAmount: changes.refundAmount,
          refundAt: changes.refundAt,
          refundStatus: changes.refundStatus,
        },
      },
      registrationTable
    )

    registration.refundAmount = (registration.refundAmount ?? 0) + amount
    registration.refundAt = new Date().toISOString()
    registration.refundStatus = 'SUCCESS'

    const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)

    // send refund notification
    try {
      const recipient = [registration.payer.email]
      const templateData = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, 'refund')
      await sendTemplatedMail('refund', registration.language, emailFrom, recipient, {
        ...templateData,
        ...transaction,
        ...changes,
        createdAt: t('dateFormat.long', { date: transaction.createdAt }),
        refundAt: t('dateFormat.long', { date: registration.refundAt }),
        paidAmount: formatMoney(registration.paidAmount ?? 0),
        amount: formatMoney(amount),
        handlingCost: formatMoney(Math.max(0, (registration.paidAmount ?? 0) - amount)),
        providerName,
      })

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
  }

  return response(200, undefined, event)
})

export default refundSuccessLambda
