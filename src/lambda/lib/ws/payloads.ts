import type { OpenPayment } from '../../../lib/payment'
import type { JsonConfirmedEvent, JsonDogEvent, JsonRegistration, Patch } from '../../../types'
import type { EventPatchPayload, EventViewerPayload, RegistrationPatchPayload, WebSocketConnection } from './types'
import { getPaymentPicture } from '../../../lib/payment'

export const buildEventPatchPayload = (eventId: string, patch: Patch<JsonDogEvent>): EventPatchPayload => ({
  eventId,
  ...patch,
})

export const buildRegistrationPatchPayload = (
  eventId: string,
  patch: Patch<JsonRegistration>[]
): RegistrationPatchPayload => ({ eventId, patch })

/**
 * The payment state the participant's page shows: the picture, worked out here from the whole row
 * (`getPaymentPicture`) as the participant never receives the group (KOE-1526). The caller loads the
 * registration's open payments (`participantPaymentPatch` in `lib/payment.ts`); the ids themselves
 * are never part of this patch (KOE-1529). The picture always has every key, so a patch merged over
 * the last one leaves nothing of it behind.
 */
export const buildParticipantPaymentPatch = (
  registration: JsonRegistration,
  event: JsonConfirmedEvent,
  openPayments: readonly OpenPayment[]
): Patch<JsonRegistration> => ({
  // The page shows a cancelled entry from this flag, and a move between groups can cancel or restore
  // one (KOE-1553). An undefined key is dropped on the wire and the merge would keep the old flag, so
  // a row without one says false.
  cancelled: registration.cancelled ?? false,
  confirmed: registration.confirmed,
  eventId: registration.eventId,
  id: registration.id,
  messagesSent: registration.messagesSent,
  paidAmount: registration.paidAmount,
  paidAt: registration.paidAt,
  payment: getPaymentPicture(event, registration, openPayments),
  paymentStatus: registration.paymentStatus,
  // The page reads the refund to know a fee that went back, and only then takes the due from here.
  refundAmount: registration.refundAmount,
  refundAt: registration.refundAt,
  refundHandlingCost: registration.refundHandlingCost,
  refundStatus: registration.refundStatus,
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
