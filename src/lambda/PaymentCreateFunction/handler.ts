import type {
  CreatePaymentResponse,
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  Organizer,
  PaymentItem,
  TransactionItem,
} from '../../types'
import type { PaymentCustomer } from '../types/paytrail'
import { nanoid } from 'nanoid'
import { auditUser } from '../../lib/audit'
import { getPaymentBalance } from '../../lib/cost'
import { isParticipantGroup, registrationActor } from '../../lib/registration'
import { paymentCreateSchema } from '../../lib/schema/payment'
import { splitName } from '../../lib/string'
import { CONFIG } from '../config'
import { getFrontendOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import {
  claimTransactionCreation,
  formatPaytrailErrorMessage,
  getTransactionsByReference,
  paymentDescription,
  releaseTransactionCreation,
  updateTransactionStatus,
} from '../lib/payment'
import { PaytrailError, paytrail } from '../lib/paytrail'
import { authorizeRegistrationEdit, getRegistration } from '../lib/registration'
import { validateBody } from '../lib/request'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { getApiHost } from '../utils/proxyEvent'

const { organizerTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

/**
 * Paytrail's line shape, built from ours. Units and VAT are its concerns, not the application's:
 * one entry, one fee, and no VAT on a trial fee.
 */
const toPaytrailItem = (item: TransactionItem): PaymentItem => ({
  description: item.description,
  merchant: item.merchantId ?? '',
  productCode: item.eventId ?? '',
  reference: item.registrationId ?? '',
  stamp: item.stamp,
  unitPrice: item.amount ?? 0,
  units: 1,
  vatPercentage: 0,
})
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
  const { eventId, registrationId } = validateBody(paymentCreateSchema, parseJSONWithFallback(event.body))

  const registration = await getRegistration(eventId, registrationId)
  const editToken = await authorizeRegistrationEdit(event, registration)
  const jsonEvent = await getEvent<JsonConfirmedEvent>(eventId)

  if (registration.cancelled) {
    return response<string>(404, 'Registration not found', event)
  }

  if (registration.paymentStatus === 'DUPLICATE') {
    return response<string>(409, 'Duplicate payment requires a refund', event)
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

  // What is still owed of the fee as the entry reads now: the whole of it, or the part a corrected
  // membership added after a member-price payment (KOE-722). A refund counts as unpaid again.
  const amount = Math.round(100 * getPaymentBalance(jsonEvent, registration).due)
  if (amount <= 0) {
    return response<string>(204, 'Already paid', event)
  }
  const stamp = nanoid()

  const items: TransactionItem[] = [
    {
      amount,
      description: paymentDescription(jsonEvent, 'fi'),
      eventId,
      merchantId: organizer.paytrailMerchantId,
      registrationId,
      stamp: nanoid(),
    },
  ]

  const customer: PaymentCustomer = {
    // We don't want to deliver the receipt from Paytrail to the customer, hence adding '.local' to the email. KOE-763
    email: (registration.payer?.email && `${registration.payer.email}.local`) ?? '',
    ...splitName(registration?.payer?.name),
    phone: registration.payer?.phone,
  }

  const language = registration.language === 'en' ? 'EN' : 'FI'

  if (
    !(await claimTransactionCreation(dynamoDB, 'payment', eventId, registrationId, stamp, STALE_PENDING_PAYMENT_AGE_MS))
  ) {
    return response<string>(409, 'Payment already in progress', event)
  }

  let result: CreatePaymentResponse | undefined | null
  try {
    result = await paytrail.createPayment({
      amount,
      apiHost: getApiHost(event),
      customer,
      editToken,
      items: items.map(toPaytrailItem),
      language,
      origin: getFrontendOrigin(event),
      reference,
      stamp,
    })
  } catch (error: unknown) {
    await releaseTransactionCreation(dynamoDB, 'payment', eventId, registrationId, stamp)
    if (error instanceof PaytrailError) {
      return response(
        error.status,
        { error: error.error, message: formatPaytrailErrorMessage('Maksun luonti', error) },
        event
      )
    }

    throw error
  }

  if (!result) {
    await releaseTransactionCreation(dynamoDB, 'payment', eventId, registrationId, stamp)
    return response<undefined>(500, undefined, event)
  }

  // The public route has no login to name; the registration's people name the payment then, and
  // the audit rows say so.
  const actor = (await authorize(event)) ?? registrationActor(registration)
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
    ...auditUser(actor),
  }
  const updatedAt = new Date().toISOString()
  await dynamoDB.documentTransaction([
    {
      Put: {
        ConditionExpression: 'attribute_not_exists(transactionId)',
        Item: transaction,
        TableName: transactionTable,
      },
    },
    {
      Update: {
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: { '#status': 'paymentStatus' },
        ExpressionAttributeValues: { ':pending': 'PENDING', ':updatedAt': updatedAt },
        Key: { eventId, id: registrationId },
        TableName: registrationTable,
        UpdateExpression:
          'SET #status = :pending, updatedAt = :updatedAt REMOVE paymentCreationAt, paymentCreationStamp',
      },
    },
  ])

  return response<CreatePaymentResponse>(200, result, event)
})

export default paymentCreateLambda
