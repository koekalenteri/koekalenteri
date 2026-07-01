import type { JsonDogEvent, JsonRegistration, Patch } from '../../../types'
import type { EventPatchPayload, EventViewerPayload, RegistrationPatchPayload, WebSocketConnection } from './types'

type ConnectionCountScope = 'public:connection-count' | 'admin:connection-count'

export const buildEventPatchPayload = (eventId: string, patch: Patch<JsonDogEvent>): EventPatchPayload => ({
  eventId,
  ...patch,
})

export const buildRegistrationPatchPayload = (
  eventId: string,
  patch: Patch<JsonRegistration>[]
): RegistrationPatchPayload => ({ eventId, patch })

export const buildEventViewersPayload = (eventId: string, viewers: EventViewerPayload[]) => ({
  eventId,
  scope: 'admin:event-viewers',
  viewers,
})

export const buildConnectionCountPayload = (scope: ConnectionCountScope, count: number) => ({ count, scope })

export const toEventViewers = (connections: WebSocketConnection[]): EventViewerPayload[] => {
  const viewersById = new Map<string, EventViewerPayload>()

  for (const { userEmail, userId, userName } of connections) {
    if (!userId || viewersById.has(userId)) continue
    viewersById.set(userId, { name: userName || userEmail || userId, userId })
  }

  return [...viewersById.values()]
}
