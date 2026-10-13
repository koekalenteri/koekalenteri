import type { ParticipantPaymentState } from '../../../lib/payment'
import type { JsonDogEvent, JsonRegistration, Patch } from '../../../types'
import type { EventPatchPayload, EventViewerPayload, RegistrationPatchPayload, WebSocketConnection } from './types'

type PaymentPatchSource = Pick<JsonRegistration, 'eventId' | 'id'> & Partial<JsonRegistration>

export const buildEventPatchPayload = (eventId: string, patch: Patch<JsonDogEvent>): EventPatchPayload => ({
  eventId,
  ...patch,
})

export const buildRegistrationPatchPayload = (
  eventId: string,
  patch: Patch<JsonRegistration>[]
): RegistrationPatchPayload => ({ eventId, patch })

/**
 * The payment state the participant's page shows. The due and the pay button are the caller's
 * (`getParticipantPaymentState`): both read the group, which the participant never receives, and a
 * patch that decided the button on its own would contradict GetRegistration (KOE-1526).
 */
export const buildParticipantPaymentPatch = (
  registration: PaymentPatchSource,
  { paymentDue, shouldPay }: ParticipantPaymentState
): Patch<JsonRegistration> => ({
  confirmed: registration.confirmed,
  eventId: registration.eventId,
  id: registration.id,
  messagesSent: registration.messagesSent,
  paidAmount: registration.paidAmount,
  paidAt: registration.paidAt,
  paymentDue,
  paymentStatus: registration.paymentStatus,
  // The page reads the refund to know a fee that went back, and only then takes the due from here.
  refundAmount: registration.refundAmount,
  refundAt: registration.refundAt,
  refundHandlingCost: registration.refundHandlingCost,
  refundStatus: registration.refundStatus,
  shouldPay,
  state: registration.state,
  updatedAt: registration.updatedAt,
})

export const buildEventViewersPayload = (eventId: string, viewers: EventViewerPayload[]) => ({
  eventId,
  scope: 'admin:event-viewers',
  viewers,
})

export const toEventViewers = (connections: WebSocketConnection[]): EventViewerPayload[] => {
  const viewersById = new Map<string, EventViewerPayload>()

  for (const { userEmail, userId, userName } of connections) {
    if (!userId || viewersById.has(userId)) continue
    viewersById.set(userId, { name: userName || userEmail || userId, userId })
  }

  return [...viewersById.values()]
}
