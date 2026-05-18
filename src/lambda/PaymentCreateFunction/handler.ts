import type { CreatePaymentResponse } from '../../types'
import { authorize } from '../auth/api'
import { getOrigin } from '../lib/api-gw'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { getRegistration, isParticipantGroup } from '../lib/registration'
import { organizerReadPort } from '../organizer/api'
import { createPaymentRequest, inspectExistingTransactions, persistPaymentCreate } from '../payment/create'
import { eventReadPort } from '../registration/api'
import { getApiHost } from '../utils/proxyEvent'

/**
 * paymentCreate is called by client to start the payment process
 */
export const paymentCreateLambda = async (event: APIGatewayProxyEvent) => {
  const { eventId, registrationId } = parseJSONWithFallback<{ eventId: string; registrationId: string }>(event.body)

  const jsonEvent = await eventReadPort.getConfirmedEvent(eventId)
  const registration = await getRegistration(eventId, registrationId)

  if (registration.cancelled) {
    return response<string>(404, 'Registration not found', event)
  }

  // Don't allow payment if event requires payment after confirmation but registration is not picked yet
  if (jsonEvent.paymentTime === 'confirmation' && !isParticipantGroup(registration.group?.key)) {
    return response<string>(403, 'Payment not allowed - registration must be picked first', event)
  }

  const organizer = await organizerReadPort.getById(jsonEvent.organizer.id)
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

  const createResult = await createPaymentRequest({
    apiHost: getApiHost(event),
    confirmedEvent: jsonEvent,
    eventId,
    organizer,
    origin: getOrigin(event),
    registration,
    registrationId,
  })

  const { amount, result, transaction } = createResult
  if (amount <= 0) {
    return response<string>(204, 'Already paid', event)
  }
  if (!result || !transaction) {
    return response<undefined>(500, undefined, event)
  }

  const user = await authorize(event)
  await persistPaymentCreate({
    eventId,
    registrationId,
    transaction,
    user: user?.name ?? registration.payer?.name,
  })

  return response<CreatePaymentResponse>(200, result, event)
}

export default lambda('paymentCreate', paymentCreateLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
