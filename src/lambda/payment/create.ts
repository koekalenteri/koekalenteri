import type {
  CreatePaymentResponse,
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  JsonRegistration,
  Organizer,
} from '../../types'
import type { PaymentCustomer, PaymentItem } from '../types/paytrail'
import { nanoid } from 'nanoid'
import { calculateCost } from '../../lib/cost'
import { paymentDescription } from '../lib/payment'
import { createPayment } from '../lib/paytrail'
import { updateRegistrationField } from '../lib/registration'
import { splitName } from '../lib/string'
import { paymentTransactionRepository } from './repository'

const STALE_PENDING_PAYMENT_AGE_MS = 5 * 60 * 1000

const isStalePendingPayment = (createdAt?: string, statusAt?: string) => {
  const timestamp = statusAt ?? createdAt
  if (!timestamp) return false
  const age = Date.now() - new Date(timestamp).getTime()
  return Number.isFinite(age) && age >= STALE_PENDING_PAYMENT_AGE_MS
}

const canReuseNewTransaction = (current: JsonPaymentTransaction | undefined, candidate: JsonPaymentTransaction) =>
  !current || new Date(candidate.createdAt).getTime() > new Date(current.createdAt).getTime()

export const inspectExistingTransactions = async (reference: string) => {
  const existingTransactions = await paymentTransactionRepository.listByReference(reference)
  if (!existingTransactions) return { freshPendingTransaction: false, reusableNewTransaction: undefined }

  let freshPendingTransaction = false
  let reusableNewTransaction: JsonPaymentTransaction | undefined

  for (const tx of existingTransactions) {
    if (tx.status !== 'new' && tx.status !== 'pending') continue
    if (isStalePendingPayment(tx.createdAt, tx.statusAt)) {
      await paymentTransactionRepository.patchStatus(tx, { status: 'fail' })
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

type CreatePaymentRequestInput = {
  apiHost: string
  eventId: string
  origin: string
  registration: JsonRegistration
  registrationId: string
  confirmedEvent: JsonConfirmedEvent
  organizer: Organizer
}

export const createPaymentRequest = async ({
  apiHost,
  eventId,
  origin,
  registration,
  registrationId,
  confirmedEvent,
  organizer,
}: CreatePaymentRequestInput): Promise<{
  amount: number
  result?: CreatePaymentResponse
  transaction?: JsonPaymentTransaction
}> => {
  const amount = Math.round(
    100 *
      (calculateCost(
        { ...confirmedEvent, entryStartDate: new Date(confirmedEvent.entryStartDate) },
        { ...registration, createdAt: new Date(registration.createdAt) }
      ).amount -
        (registration.paidAmount ?? 0))
  )

  if (amount <= 0) return { amount }

  const reference = `${eventId}:${registrationId}`
  const stamp = nanoid()
  const items: PaymentItem[] = [
    {
      description: paymentDescription(confirmedEvent, 'fi'),
      merchant: organizer.paytrailMerchantId!,
      productCode: eventId,
      reference: registrationId,
      stamp: nanoid(),
      unitPrice: amount,
      units: 1,
      vatPercentage: 0,
    },
  ]
  const customer: PaymentCustomer = {
    email: (registration.payer?.email && `${registration.payer.email}.local`) ?? '',
    ...splitName(registration?.payer?.name),
    phone: registration.payer?.phone,
  }
  const language = registration.language === 'en' ? 'EN' : 'FI'

  const result = await createPayment({ amount, apiHost, customer, items, language, origin, reference, stamp })
  if (!result) return { amount }

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
    user: registration.payer?.name,
  }
  return { amount, result, transaction }
}

export const persistPaymentCreate = async (params: {
  eventId: string
  registrationId: string
  transaction: JsonPaymentTransaction
  user: string | undefined
}) => {
  await paymentTransactionRepository.createPayment({
    ...params.transaction,
    user: params.user ?? params.transaction.user,
  })
  await updateRegistrationField(params.eventId, params.registrationId, 'paymentStatus', 'PENDING')
}
