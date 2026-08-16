import type { JsonRegistration, JsonTransaction } from '../../types'
import type { PaytrailCallbackParams } from '../types/paytrail'
import { i18n } from '../../i18n/lambda'
import { getCostSegmentName } from '../../lib/cost'
import { formatMoney } from '../../lib/money'
import { getProviderName, getRegistrationPaymentDetails } from '../../lib/payment'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import {
  fixRegistrationGroups,
  lockRegistrationGroups,
  lockRegistrationPayments,
  updateRegistrations,
} from '../lib/event'
import { lambda, response } from '../lib/lambda'
import { createDynamoLease } from '../lib/lease'
import { applySuccessfulPayment, parseParams, updateTransactionStatus, verifyParams } from '../lib/payment'
import {
  clearRegistrationEmailDeliveryStatus,
  createRegistrationPatch,
  createRegistrationPatches,
  getReadyRegistrationsByEventId,
  getRegistration,
  getRegistrationEditToken,
} from '../lib/registration'
import { publishRegistrationPatchesStrict } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { frontendURL, emailFrom, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)
const POST_PAYMENT_LEASE_DURATION_MS = 90 * 1000

type PostPaymentPhase =
  | 'confirmationSentAt'
  | 'paymentAuditAt'
  | 'postPaymentProcessedAt'
  | 'postPaymentPublishedAt'
  | 'receiptSentAt'

const postPaymentLease = createDynamoLease<JsonTransaction, PostPaymentPhase>({
  client: dynamoDB,
  durationMs: POST_PAYMENT_LEASE_DURATION_MS,
  itemExistsField: 'transactionId',
  leaseField: 'postPaymentLease',
  table: transactionTable,
})

const claimPostPaymentWorkflow = async (transactionId: string) => {
  const claim = await postPaymentLease.claim({
    key: { transactionId },
    missingItemMessage: `Transaction '${transactionId}' disappeared while claiming post-payment workflow`,
  })
  if (!claim) return undefined

  return { release: claim.release, token: claim.token, transaction: claim.item }
}

const markPostPaymentPhase = (transactionId: string, token: string, field: PostPaymentPhase) =>
  postPaymentLease.markPhase({ transactionId }, token, field)

const recordDuplicatePayment = async (
  transaction: JsonTransaction,
  duplicateOf: Pick<JsonRegistration, 'eventId' | 'id'>,
  provider: string | undefined,
  transactionExists: boolean,
  registration: Parameters<typeof registrationAuditKey>[0]
) => {
  const duplicateOfRegistrationId = duplicateOf.id
  const duplicatePaymentAt = new Date().toISOString()
  const saved = {
    ...transaction,
    duplicateOfRegistrationId,
    duplicatePaymentAt,
    ...(provider ? { provider } : {}),
    status: 'ok' as const,
    statusAt: duplicatePaymentAt,
  }
  if (transactionExists) {
    await dynamoDB.update(
      { transactionId: transaction.transactionId },
      {
        remove: ['paymentResponse'],
        set: {
          duplicateOfRegistrationId,
          duplicatePaymentAt,
          ...(provider ? { provider } : {}),
          status: 'ok',
          statusAt: duplicatePaymentAt,
        },
      },
      transactionTable
    )
  } else {
    await dynamoDB.write(saved, transactionTable)
  }
  await dynamoDB.update(
    { eventId: registration.eventId, id: registration.id },
    { set: { paymentStatus: 'DUPLICATE', updatedAt: duplicatePaymentAt } },
    registrationTable
  )
  await audit({
    auditKey: registrationAuditKey(registration),
    message: `Päällekkäinen maksu (${getProviderName(provider)}), ${formatMoney(transaction.amount / 100)}, toinen ilmoittautuminen: ${duplicateOfRegistrationId}`,
    user: transaction.user ?? 'anonymous',
  })
  await audit({
    auditKey: registrationAuditKey(duplicateOf),
    message: `Toisen ilmoittautumisen päällekkäinen maksu (${getProviderName(provider)}), ${formatMoney(transaction.amount / 100)}, maksun ilmoittautuminen: ${registration.id}`,
    user: transaction.user ?? 'anonymous',
  })
}

const applyPaymentToRegistration = async (
  initialRegistration: JsonRegistration,
  eventId: string,
  registrationId: string,
  transaction: JsonTransaction,
  provider: string | undefined,
  transactionExists: boolean
) => {
  let registration = initialRegistration
  let previouslyPaid = 0
  let appliedPayment = false
  let duplicatePayment = false
  const releasePaymentLock = await lockRegistrationPayments(registration.eventId)
  try {
    registration = await getRegistration(eventId, registrationId)
    if (registration.state === 'creating') {
      const readyRegistrations = await getReadyRegistrationsByEventId(registration.eventId, true)
      const duplicate = readyRegistrations.find(
        (item) => item.id !== registration.id && item.dog.regNo === registration.dog.regNo
      )
      if (duplicate) {
        await recordDuplicatePayment(transaction, duplicate, provider, transactionExists, registration)
        duplicatePayment = true
      }
    }
    if (duplicatePayment) return { appliedPayment, duplicatePayment, previouslyPaid, registration }

    previouslyPaid = registration.paidAmount ?? 0
    const confirmed = Boolean(registration.messagesSent?.picked || registration.confirmed)
    const applied = await applySuccessfulPayment(
      transaction,
      eventId,
      registrationId,
      provider,
      confirmed,
      transactionExists,
      previouslyPaid
    )
    appliedPayment = applied.applied
    if (appliedPayment) {
      registration.paidAmount = previouslyPaid + transaction.amount / 100
      registration.paidAt = applied.appliedAt
      registration.paymentStatus = 'SUCCESS'
      registration.state = 'ready'
      registration.updatedAt = registration.paidAt
      if (confirmed) registration.confirmed = true
    }
    return { appliedPayment, duplicatePayment, previouslyPaid, registration }
  } finally {
    await releasePaymentLock()
  }
}

interface ReceiptOptions {
  appliedPayment: boolean
  confirmedEvent: Awaited<ReturnType<typeof updateRegistrations>>
  editToken: string
  paidAmount: number
  previouslyPaid: number
  registration: JsonRegistration
  transaction: JsonTransaction
  workflow: JsonTransaction
}

const sendPaymentReceipt = async ({
  appliedPayment,
  confirmedEvent,
  editToken,
  paidAmount,
  previouslyPaid,
  registration,
  transaction,
  workflow,
}: ReceiptOptions) => {
  const t = i18n.getFixedT(registration.language)
  const receiptTo = registration.payer?.email ? [registration.payer.email] : []
  const templateData = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, 'receipt', editToken)
  const paymentDetails = getRegistrationPaymentDetails(confirmedEvent, registration)
  const memberPrice = paymentDetails.isMember ? ` (${t('costForMembers')})` : ''
  const customDescription = paymentDetails.costObject?.custom?.description
  const costSegmentName =
    paymentDetails.strategy === 'custom' && customDescription?.fi
      ? customDescription[registration.language] || customDescription.fi
      : t(getCostSegmentName(paymentDetails.strategy), paymentDetails.translationOptions)
  const optionalCosts = paymentDetails.optionalCosts
    .map(
      (cost) =>
        `${cost.description[registration.language] || cost.description.fi}${memberPrice} ${formatMoney(cost.cost)}`
    )
    .join(', ')
  const workflowPreviouslyPaid = workflow.receiptPreviouslyPaid ?? (appliedPayment ? previouslyPaid : 0)
  const totalPaid = workflow.receiptTotalPaid ?? (appliedPayment ? previouslyPaid + paidAmount : previouslyPaid)
  await clearRegistrationEmailDeliveryStatus(registration.eventId, registration.id)
  await sendTemplatedMail(
    'receipt',
    registration.language,
    emailFrom,
    receiptTo,
    {
      ...templateData,
      ...transaction,
      amount: formatMoney(paidAmount),
      createdAt: t('dateFormat.long', { date: transaction.createdAt }),
      optionalCosts,
      previouslyPaid: workflowPreviouslyPaid ? formatMoney(workflowPreviouslyPaid) : undefined,
      registrationCost: formatMoney(paymentDetails.cost),
      registrationCostName: `${costSegmentName}${memberPrice}`,
      totalPaid: formatMoney(totalPaid),
    },
    registrationEmailTags(registration, 'receipt')
  )
  await audit({
    auditKey: registrationAuditKey(registration),
    message: `Email: ${templateData.subject}, to: ${receiptTo.join(', ')}`,
    user: transaction.user ?? 'anonymous',
  })
}

const publishSuccessfulPayment = async (registration: JsonRegistration, registrationId: string) => {
  const releaseGroupsLock = await lockRegistrationGroups(registration.eventId, 8)
  try {
    const readyRegistrations = await getReadyRegistrationsByEventId(registration.eventId, true)
    const beforeReconciliation = readyRegistrations.map((item) => ({
      ...item,
      ...(item.group ? { group: { ...item.group } } : {}),
    }))
    const reconciled = await fixRegistrationGroups(readyRegistrations, { name: 'payment' })
    const updatedRegistration =
      reconciled.find((item) => item.id === registrationId) ??
      (await getRegistration(registration.eventId, registrationId))
    const confirmedEvent = await updateRegistrations(registration.eventId)
    const groupPatches = createRegistrationPatches(reconciled, beforeReconciliation)
    await publishRegistrationPatchesStrict(
      registration.eventId,
      [
        createRegistrationPatch(updatedRegistration),
        ...groupPatches.filter((patch) => patch.id !== updatedRegistration.id),
      ],
      confirmedEvent.organizer.id
    )
    return { confirmedEvent, registration: updatedRegistration }
  } finally {
    await releaseGroupsLock()
  }
}

const handleSuccessfulPayment = async (
  eventId: string,
  registrationId: string,
  transaction: JsonTransaction,
  provider: string | undefined,
  transactionExists: boolean
) => {
  const initialRegistration = await getRegistration(eventId, registrationId)
  const editToken = await getRegistrationEditToken(initialRegistration)

  const paidAmount = transaction.amount / 100
  const payment = await applyPaymentToRegistration(
    initialRegistration,
    eventId,
    registrationId,
    transaction,
    provider,
    transactionExists
  )
  const { registration } = payment
  const { appliedPayment, duplicatePayment, previouslyPaid } = payment

  // The provider captured this payment, and it is now recorded as a visible,
  // refundable duplicate. Acknowledge the callback to stop permanent retries.
  if (duplicatePayment) return true

  const workflowClaim = await claimPostPaymentWorkflow(transaction.transactionId)
  // Another callback owns the idempotent post-payment phases. The payment
  // transaction has already been applied above, so acknowledge this callback
  // instead of turning successful payment processing into a provider retry.
  if (!workflowClaim) return true

  // Claiming serializes external side effects. The re-read is essential: a
  // callback that waited behind a completed attempt must observe its markers.
  const workflow = workflowClaim.transaction
  try {
    if (workflow.postPaymentProcessedAt) return true

    const confirmedEvent = await updateRegistrations(registration.eventId)

    // send receipt
    if (!workflow.receiptSentAt) {
      await sendPaymentReceipt({
        appliedPayment,
        confirmedEvent,
        editToken,
        paidAmount,
        previouslyPaid,
        registration,
        transaction,
        workflow,
      })
      await markPostPaymentPhase(transaction.transactionId, workflowClaim.token, 'receiptSentAt')
    }

    if (!workflow.paymentAuditAt) {
      await audit({
        auditKey: registrationAuditKey(registration),
        message: `Maksu (${getProviderName(provider)}), ${formatMoney(paidAmount)}`,
        user: transaction.user ?? 'anonymous',
      })
      await markPostPaymentPhase(transaction.transactionId, workflowClaim.token, 'paymentAuditAt')
    }

    if (confirmedEvent.paymentTime !== 'confirmation' && !workflow.confirmationSentAt) {
      // send confirmation message
      const to = emailTo(registration)
      const data = registrationEmailTemplateData(registration, confirmedEvent, frontendURL, '', editToken)
      await clearRegistrationEmailDeliveryStatus(eventId, registrationId)
      await sendTemplatedMail(
        'registration',
        registration.language,
        emailFrom,
        to,
        data,
        registrationEmailTags(registration, 'registration')
      )

      await audit({
        auditKey: registrationAuditKey(registration),
        message: `Email: ${data.subject}, to: ${to.join(', ')}`,
        user: transaction.user ?? 'anonymous',
      })
      await markPostPaymentPhase(transaction.transactionId, workflowClaim.token, 'confirmationSentAt')
    }

    if (!workflow.postPaymentPublishedAt) {
      // Publication is deliberately last: a flaky admin socket must not block
      // the payer's receipt or confirmation email. Incremental refresh is the
      // admin-side recovery path if this strict publication needs a retry.
      await publishSuccessfulPayment(registration, registrationId)
      await markPostPaymentPhase(transaction.transactionId, workflowClaim.token, 'postPaymentPublishedAt')
    }

    await markPostPaymentPhase(transaction.transactionId, workflowClaim.token, 'postPaymentProcessedAt')

    return true
  } finally {
    await workflowClaim.release()
  }
}

/**
 * paymentSuccess is called by payment provider, to update successful payment status
 */
const paymentSuccessLambda = lambda('paymentSuccess', async (event) => {
  const params: Partial<PaytrailCallbackParams> = event.queryStringParameters ?? {}
  const { eventId, provider, registrationId, status, transactionId } = parseParams(params)

  await verifyParams(params)
  if (!transactionId) throw new Error('Missing transaction id')

  const storedTransaction = await dynamoDB.read<JsonTransaction>({ transactionId })
  const callbackAmount = Number.parseInt(params['checkout-amount'] ?? '', 10)
  if (!storedTransaction && status !== 'ok') {
    throw new Error(`Transaction with id '${transactionId}' was not found`)
  }
  if (!Number.isInteger(callbackAmount) || callbackAmount <= 0) {
    throw new Error(`Transaction '${transactionId}' callback amount is invalid`)
  }
  const transaction: JsonTransaction = storedTransaction ?? {
    amount: callbackAmount,
    createdAt: new Date().toISOString(),
    reference: `${eventId}:${registrationId}`,
    stamp: params['checkout-stamp'] ?? transactionId,
    status: 'new',
    transactionId,
    type: 'payment',
  }

  const reference = `${eventId}:${registrationId}`
  if (transaction.reference !== reference) {
    throw new Error(`Transaction '${transactionId}' has reference '${transaction.reference}', expected '${reference}'`)
  }
  if (callbackAmount !== transaction.amount) {
    throw new Error(`Transaction '${transactionId}' callback amount does not match the stored amount`)
  }

  if (status === 'ok') {
    await handleSuccessfulPayment(eventId, registrationId, transaction, provider, Boolean(storedTransaction))
  } else {
    await updateTransactionStatus(transaction, status, provider)
  }

  return response(200, undefined, event)
})

export default paymentSuccessLambda
