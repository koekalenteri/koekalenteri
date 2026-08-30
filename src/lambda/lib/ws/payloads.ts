import type { JsonDogEvent, JsonRegistration, Patch } from '../../../types'
import type { EventPatchPayload, EventViewerPayload, RegistrationPatchPayload, WebSocketConnection } from './types'

type ParticipantPaymentRegistration = Pick<JsonRegistration, 'eventId' | 'id'> & Partial<JsonRegistration>

export const buildEventPatchPayload = (eventId: string, patch: Patch<JsonDogEvent>): EventPatchPayload => ({
  eventId,
  ...patch,
})

export const buildRegistrationPatchPayload = (
  eventId: string,
  patch: Patch<JsonRegistration>[]
): RegistrationPatchPayload => ({ eventId, patch })

export const buildParticipantPaymentPatch = (
  registration: ParticipantPaymentRegistration
): Patch<JsonRegistration> => ({
  confirmed: registration.confirmed,
  eventId: registration.eventId,
  id: registration.id,
  messagesSent: registration.messagesSent,
  paidAmount: registration.paidAmount,
  paidAt: registration.paidAt,
  paymentStatus: registration.paymentStatus,
  shouldPay: registration.paymentStatus === 'SUCCESS' ? false : registration.shouldPay,
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
