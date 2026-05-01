import type { CreatePaymentResponse, JsonConfirmedEvent, JsonPaymentTransaction, Organizer } from '../../types'
import type { PaymentCustomer, PaymentItem } from '../types/paytrail'
import { nanoid } from 'nanoid'
import { calculateCost } from '../../lib/cost'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { getTransactionsByReference, paymentDescription, updateTransactionStatus } from '../lib/payment'
import { createPayment } from '../lib/paytrail'
import { getRegistration, isParticipantGroup, updateRegistrationField } from '../lib/registration'
import { splitName } from '../lib/string'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { getApiHost } from '../utils/proxyEvent'

const { organizerTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)
const STALE_PENDING_PAYMENT_AGE_MS = 5 * 60 * 1000

const isStalePendingPayment = (createdAt?: string, statusAt?: string) => {
  const timestamp = statusAt ?? createdAt
  if (!timestamp) return false

  const age = Date.now() - new Date(timestamp).getTime()
  return Number.isFinite(age) && age >= STALE_PENDING_PAYMENT_AGE_MS
}

const canReuseNewTransaction = (current: JsonPaymentTransaction | undefined, candidate: JsonPaymentTransaction) =>
  !current || new Date(candidate.createdAt).getTime() > new Date(current.createdAt).getTime()

const inspectExistingTransactions = async (reference: string) => {
  const existingTransactions = await getTransactionsByReference(reference)

  if (!existingTransactions) {
    return { freshPendingTransaction: false, reusableNewTransaction: undefined }
  }

  let freshPendingTransaction = false
  let reusableNewTransaction: JsonPaymentTransaction | undefined

  for (const tx of existingTransactions) {
    if (tx.status !== 'new' && tx.status !== 'pending') {
      continue
    }

    if (isStalePendingPayment(tx.createdAt, tx.statusAt)) {
      await updateTransactionStatus(tx, 'fail')
      continue
    }

    if (tx.status === 'pending') {
      freshPendingTransaction = true
      continue
    }

    if (canReuseNewTransaction(reusableNewTransaction, tx as JsonPaymentTransaction)) {
      reusableNewTransaction = tx as JsonPaymentTransaction
    }
  }

  return { freshPendingTransaction, reusableNewTransaction }
}

/**
 * paymentCreate is called by client to start the payment process
 */
const paymentCreateLambda = lambda('paymentCreate', async (event) => {
  const { eventId, registrationId } = parseJSONWithFallback<{ eventId: string; registrationId: string }>(event.body)

  const jsonEvent = await getEvent<JsonConfirmedEvent>(eventId)
  const registration = await getRegistration(eventId, registrationId)

  if (registration.cancelled) {
    return response<string>(404, 'Registration not found', event)
  }

  // Don't allow payment if event requires payment after confirmation but registration is not picked yet
  if (jsonEvent.paymentTime === 'confirmation' && !isParticipantGroup(registration.group?.key)) {
    return response<string>(403, 'Payment not allowed - registration must be picked first', event)
  }

  const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
  if (!organizer?.paytrailMerchantId) {
    return response<string>(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`, event)
  }

  const reference = `${eventId}:${registrationId}`
  const { freshPendingTransaction, reusableNewTransaction } = await inspectExistingTransactions(reference)

  if (reusableNewTransaction?.paymentResponse) {
    return response<CreatePaymentResponse>(200, reusableNewTransaction.paymentResponse, event)
  }

  if (freshPendingTransaction) {
    return response<string>(409, 'Payment already in progress', event)
  }

  const amount = Math.round(
    100 *
      (calculateCost(
        { ...jsonEvent, entryStartDate: new Date(jsonEvent.entryStartDate) },
        { ...registration, createdAt: new Date(registration.createdAt) }
      ).amount -
        (registration.paidAmount ?? 0))
  )
  if (amount <= 0) {
    return response<string>(204, 'Already paid', event)
  }
  const stamp = nanoid()

  const items: PaymentItem[] = [
    {
      description: paymentDescription(jsonEvent, 'fi'),
      merchant: organizer.paytrailMerchantId,
      productCode: eventId,
      reference: registrationId,
      stamp: nanoid(),
      unitPrice: amount,
      units: 1,
      vatPercentage: 0,
    },
  ]

  const customer: PaymentCustomer = {
    // We don't want to deliver the receipt from Paytrail to the customer, hence adding '.local' to the email. KOE-763
    email: (registration.payer?.email && `${registration.payer.email}.local`) ?? '',
    ...splitName(registration?.payer?.name),
    phone: registration.payer?.phone,
  }

  const language = registration.language === 'en' ? 'EN' : 'FI'

  const result = await createPayment({
    amount,
    apiHost: getApiHost(event),
    customer,
    items,
    language,
    origin: getOrigin(event),
    reference,
    stamp,
  })

  if (!result) {
    return response<undefined>(500, undefined, event)
  }

  const user = await authorize(event)
  const transaction: JsonPaymentTransaction = {
    amount,
    bankReference: result.reference,
    createdAt: new Date().toISOString(),
    items,
    paymentResponse: result,
    reference,
    stamp,
    status: 'new',
    transactionId: result.transactionId,
    type: 'payment',
    user: user?.name ?? registration.payer?.name,
  }
  await dynamoDB.write(transaction)

  await updateRegistrationField(eventId, registrationId, 'paymentStatus', 'PENDING')

  return response<CreatePaymentResponse>(200, result, event)
})

export default paymentCreateLambda
