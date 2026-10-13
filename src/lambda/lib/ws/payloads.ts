import type { JsonConfirmedEvent, JsonDogEvent, JsonRegistration, Patch } from '../../../types'
import type { EventPatchPayload, EventViewerPayload, RegistrationPatchPayload, WebSocketConnection } from './types'
import { getParticipantPaymentState } from '../../../lib/payment'

export const buildEventPatchPayload = (eventId: string, patch: Patch<JsonDogEvent>): EventPatchPayload => ({
  eventId,
  ...patch,
})

export const buildRegistrationPatchPayload = (
  eventId: string,
  patch: Patch<JsonRegistration>[]
): RegistrationPatchPayload => ({ eventId, patch })

/**
 * The payment state the participant's page shows. The due and the pay button are worked out here from
 * the same row (`getParticipantPaymentState`): both read the group, which the participant never
 * receives, and the rule is GetRegistration's (KOE-1526). `paymentInProgress` is computed by the
 * caller (`participantPaymentPatch` in `lib/payment.ts`) from the registration's open payment ids and
 * passed in on the row; the ids themselves are never part of this patch (KOE-1529).
 */
export const buildParticipantPaymentPatch = (
  registration: JsonRegistration,
  event: JsonConfirmedEvent
): Patch<JsonRegistration> => {
  const { paymentDue, shouldPay } = getParticipantPaymentState(event, registration)
  return {
    confirmed: registration.confirmed,
    eventId: registration.eventId,
    id: registration.id,
    messagesSent: registration.messagesSent,
    paidAmount: registration.paidAmount,
    paidAt: registration.paidAt,
    paymentDue,
    paymentInProgress: registration.paymentInProgress,
    paymentStatus: registration.paymentStatus,
    // The page reads the refund to know a fee that went back, and only then takes the due from here.
    refundAmount: registration.refundAmount,
    refundAt: registration.refundAt,
    refundHandlingCost: registration.refundHandlingCost,
    refundStatus: registration.refundStatus,
    shouldPay,
    state: registration.state,
    updatedAt: registration.updatedAt,
  }
}

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
