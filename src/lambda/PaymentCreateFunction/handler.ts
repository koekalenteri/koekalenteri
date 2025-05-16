import type {
  CreatePaymentResponse,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonTransaction,
  Organizer,
} from '../../types'
import type { PaymentCustomer, PaymentItem } from '../types/paytrail'

import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda } from '../lib/lambda'
import { paymentDescription } from '../lib/payment'
import { createPayment } from '../lib/paytrail'
import { getRegistration } from '../lib/registration'
import { splitName } from '../lib/string'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { getApiHost } from '../utils/proxyEvent'
import { response } from '../utils/response'

const { organizerTable, registrationTable, transactionTable } = CONFIG
const dynamoDB = new CustomDynamoClient(transactionTable)

const registrationCost = (event: JsonConfirmedEvent, registration: JsonRegistration): number => {
  const isMember = registration.handler?.membership || registration.owner?.membership
  return event.costMember && isMember ? event.costMember : event.cost
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

  const organizer = await dynamoDB.read<Organizer>({ id: jsonEvent?.organizer.id }, organizerTable)
  if (!organizer?.paytrailMerchantId) {
    return response<string>(412, `Organizer ${jsonEvent.organizer.id} does not have MerchantId!`, event)
  }

  const reference = `${eventId}:${registrationId}`
  const amount = Math.round(100 * (registrationCost(jsonEvent, registration) - (registration.paidAmount ?? 0)))
  if (amount <= 0) {
    return response<string>(204, 'Already paid', event)
  }
  const stamp = nanoid()

  const items: PaymentItem[] = [
    {
      unitPrice: amount,
      units: 1,
      vatPercentage: 0,
      productCode: eventId,
      description: paymentDescription(jsonEvent, 'fi'),
      stamp: nanoid(),
      reference: registrationId,
      merchant: organizer.paytrailMerchantId,
    },
  ]

  const customer: PaymentCustomer = {
    // We don't want to deliver the receipt from Paytrail to the customer, hence adding '.local' to the email. KOE-763
    email: registration.payer.email && `${registration.payer.email}.local`,
    ...splitName(registration?.payer.name),
    phone: registration.payer.phone,
  }

  const result = await createPayment(getApiHost(event), getOrigin(event), amount, reference, stamp, items, customer)

  if (!result) {
    return response<undefined>(500, undefined, event)
  }

  const user = await authorize(event)
  const transaction: JsonTransaction = {
    transactionId: result.transactionId,
    status: 'new',
    amount,
    reference,
    bankReference: result.reference,
    type: 'payment',
    stamp,
    items,
    createdAt: new Date().toISOString(),
    user: user?.name ?? registration.payer.name,
  }
  await dynamoDB.write(transaction)

  await dynamoDB.update(
    { eventId, id: registrationId },
    {
      set: {
        paymentStatus: 'PENDING',
      },
    },
    registrationTable
  )

  return response<CreatePaymentResponse>(200, result, event)
})

export default paymentCreateLambda
