import type {
  CreatePaymentResponse,
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonRegistration,
  Organizer,
  PaymentItem,
  TransactionItem,
} from '../../types'
import type { PaymentCustomer } from '../types/paytrail'
import { nanoid } from 'nanoid'
import { auditUser } from '../../lib/audit'
import {
  getPaymentPicture,
  isEventOpenForPayment,
  isPaymentInProgress,
  isPaymentOpenForPlace,
  isStalePendingPayment,
  paytrailRefusalBody,
  STALE_PENDING_PAYMENT_AGE_MS,
} from '../../lib/payment'
import { registrationActor } from '../../lib/registration'
import { paymentCreateSchema } from '../../lib/schema/payment'
import { splitName } from '../../lib/string'
import { mapWithConcurrency } from '../../lib/utils'
import { CONFIG } from '../config'
import { getFrontendOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import {
  claimTransactionCreation,
  dropOpenTransaction,
  failUnfinishedTransaction,
  getTransactionsByReference,
  loadOpenPayments,
  paymentDescription,
  releaseTransactionCreation,
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
const canReuseNewTransaction = (current: JsonPaymentTransaction | undefined, candidate: JsonPaymentTransaction) =>
  !current || new Date(candidate.createdAt).getTime() > new Date(current.createdAt).getTime()

// A refund shares the payment's reference; it is RefundCreate's to finish, never touched here. A
// type predicate, not a plain boolean, so the rest of the loop below narrows without a cast.
const isUnfinishedPayment = (tx: JsonPaymentTransaction | JsonRefundTransaction): tx is JsonPaymentTransaction =>
  tx.type === 'payment' && (tx.status === 'new' || tx.status === 'pending')

const inspectExistingTransactions = async (
  reference: string,
  registration: Pick<JsonRegistration, 'eventId' | 'id'>
) => {
  const existingTransactions = await getTransactionsByReference(reference)

  if (!existingTransactions) {
    return { freshPendingTransaction: false, reusableNewTransaction: undefined }
  }

  let freshPendingTransaction = false
  let reusableNewTransaction: JsonPaymentTransaction | undefined
  const staleTransactions: JsonPaymentTransaction[] = []

  for (const tx of existingTransactions) {
    if (!isUnfinishedPayment(tx)) continue

    if (isStalePendingPayment(tx.createdAt, tx.statusAt)) {
      staleTransactions.push(tx)
      continue
    }

    if (isPaymentInProgress(tx)) {
      freshPendingTransaction = true
      continue
    }

    if (canReuseNewTransaction(reusableNewTransaction, tx)) {
      reusableNewTransaction = tx
    }
  }

  // Resolves each stale attempt and drops it from the open set, same as every other writer, but
  // with no audit row: nothing failed here, the attempt was simply never finished (KOE-1529).
  // One at a time, in order (AGENTS.md, Promises and async): a registration realistically has at
  // most one or two stale transactions here, and each one's own pair of writes (the transaction
  // row, then the registration's open set) is easiest to reason about settled fully before the
  // next one starts, rather than interleaved with it.
  await mapWithConcurrency(staleTransactions, 1, async (tx) => {
    await failUnfinishedTransaction(tx)
    await dropOpenTransaction(registration, 'openPayments', tx.transactionId)
  })

  return { freshPendingTransaction, reusableNewTransaction }
}

/**
 * paymentCreate is called by client to start the payment process
 */
const paymentCreateLambda = lambda('paymentCreate', async (event) => {
  const { eventId, registrationId } = validateBody(paymentCreateSchema, parseJSONWithFallback(event.body))

  const registration = await getRegistration(eventId, registrationId)
  const editToken = authorizeRegistrationEdit(event, registration)
  const jsonEvent = await getEvent<JsonConfirmedEvent>(eventId)

  if (registration.cancelled) {
    throw httpError(404, 'Registration not found')
  }

  // A trial that is not confirmed, a cancelled one say, asks nothing of anyone (KOE-1526).
  if (!isEventOpenForPayment(jsonEvent)) {
    throw httpError(404, 'Event is not open for payment')
  }

  // The picture is worked out from the whole row and its open payments, as the participant's own
  // pages have it from GetRegistration (KOE-1530).
  const picture = getPaymentPicture(jsonEvent, registration, await loadOpenPayments(registration.openPayments))

  if (picture.status === 'duplicate') {
    throw httpError(409, 'Duplicate payment requires a refund')
  }

  // Paying at confirmation, only a place pays: the rule the pay offer reads (KOE-1526).
  if (!isPaymentOpenForPlace(jsonEvent, registration)) {
    throw httpError(403, 'Payment not allowed - registration must be picked first')
  }

  const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
  if (!organizer?.paytrailMerchantId) {
    throw httpError(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`)
  }

  const reference = `${eventId}:${registrationId}`
  const { freshPendingTransaction, reusableNewTransaction } = await inspectExistingTransactions(reference, registration)

  if (reusableNewTransaction?.paymentResponse) {
    return response<CreatePaymentResponse>(200, reusableNewTransaction.paymentResponse, event)
  }

  if (freshPendingTransaction) {
    throw httpError(409, 'Payment already in progress')
  }

  // What is still owed of the fee as the entry reads now: the whole of it, or the part a corrected
  // membership added after a member-price payment (KOE-722). A fee that went back is owed again only
  // once the entry holds a place; a reserve's is settled, and gets 204 (KOE-1526).
  const amount = Math.round(100 * picture.due)
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
    throw httpError(409, 'Payment already in progress')
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
      // Paytrail's own words, marked as Paytrail's: the payment page puts them in the payer's language
      // (KOE-1513). Answered rather than thrown, so a Paytrail 5xx is not logged again as unhandled.
      return response(error.status, paytrailRefusalBody(error.error), event)
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
        ExpressionAttributeValues: { ':transactionId': new Set([transaction.transactionId]), ':updatedAt': updatedAt },
        Key: { eventId, id: registrationId },
        TableName: registrationTable,
        UpdateExpression:
          'SET updatedAt = :updatedAt REMOVE paymentCreationAt, paymentCreationStamp ADD openPayments :transactionId',
      },
    },
  ])

  return response<CreatePaymentResponse>(200, result, event)
})

export default paymentCreateLambda
