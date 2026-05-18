import type { DeepPartial, JsonDogEvent, JsonRegistration } from '../../../types'
import type { WebSocketConnection } from './types'
import { broadcast } from './broadcast'
import { disconnectWebSocket } from './connectionLifecycle'
import { eventAudience, organizerAudience, publicAudience } from './connectionSelectors'
import {
  buildConnectionCountPayload,
  buildEventPatchPayload,
  buildEventViewersPayload,
  buildRegistrationPatchPayload,
  toEventViewers,
} from './payloads'
import { subscribeToEvent, unsubscribeFromEvent } from './subscriptionService'

type EventPatch = Partial<Pick<JsonDogEvent, 'classes' | 'entries' | 'members'>> & { eventId: string }

const send = <T>(args: Omit<Parameters<typeof broadcast<T>>[0], 'onGoneConnection'>) =>
  broadcast<T>({
    ...args,
    onGoneConnection: async (id) => {
      await disconnectWebSocket(id)
    },
  })

export const publishPublicEvent = (patch: EventPatch) =>
  send({
    audience: publicAudience,
    buildPayload: () => buildEventPatchPayload(patch.eventId, patch),
  })

export const publishAdminEventPatch = (patch: EventPatch, organizerId: string) =>
  send({
    audience: () => organizerAudience(organizerId),
    buildPayload: () => buildEventPatchPayload(patch.eventId, patch),
  })

export const publishRegistrationPatches = (
  eventId: string,
  patch: DeepPartial<JsonRegistration>[],
  organizerId: string
) =>
  send({
    audience: () => eventAudience(eventId, organizerId),
    buildPayload: () => ({ scope: 'admin:event-registrations', ...buildRegistrationPatchPayload(eventId, patch) }),
  })

export const publishEventViewers = (eventId: string, organizerId: string) =>
  send({
    audience: () => eventAudience(eventId, organizerId),
    buildPayload: (audience) => buildEventViewersPayload(eventId, toEventViewers(audience)),
  })

export const publishConnectionCount = () =>
  send({
    audience: publicAudience,
    buildPayload: (audience) => buildConnectionCountPayload(audience.length),
  })

export const subscribeWebSocketToEvent = (connection: WebSocketConnection, eventId: string) =>
  subscribeToEvent(connection, eventId, publishEventViewers)

export const unsubscribeWebSocketFromEvent = (connectionId: string) =>
  unsubscribeFromEvent(connectionId, publishEventViewers)
