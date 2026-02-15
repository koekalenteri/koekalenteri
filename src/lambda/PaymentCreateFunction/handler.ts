import type { CreatePaymentResponse, JsonConfirmedEvent, JsonTransaction, Organizer } from '../../types'
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
import { getRegistration, updateRegistrationField } from '../lib/registration'
import { splitName } from '../lib/string'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { getApiHost } from '../utils/proxyEvent'

const { organizerTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

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

  // Don't allow payment if event requires payment after confirmation but registration is not confirmed
  if (jsonEvent.paymentTime === 'confirmation' && !registration.confirmed) {
    return response<string>(403, 'Payment not allowed - registration must be confirmed first', event)
  }

  const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
  if (!organizer?.paytrailMerchantId) {
    return response<string>(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`, event)
  }

  const reference = `${eventId}:${registrationId}`

  // Cancel any existing 'new' transactions for this reference
  const existingTransactions = await getTransactionsByReference(reference)
  if (existingTransactions) {
    for (const tx of existingTransactions) {
      if (tx.status === 'new') {
        await updateTransactionStatus(tx, 'fail')
      }
    }
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
  const transaction: JsonTransaction = {
    amount,
    bankReference: result.reference,
    createdAt: new Date().toISOString(),
    items,
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
