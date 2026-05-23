import type { DeepPartial, JsonDogEvent, JsonRegistration } from '../../../types'
import type { EventPatchPayload, EventViewer, RegistrationPatchPayload, WebSocketConnection } from './types'

type ConnectionCountScope = 'public:connection-count' | 'admin:connection-count'

export const buildEventPatchPayload = (eventId: string, patch: Partial<JsonDogEvent>): EventPatchPayload => ({
  eventId,
  ...patch,
})

export const buildRegistrationPatchPayload = (
  eventId: string,
  patch: DeepPartial<JsonRegistration>[]
): RegistrationPatchPayload => ({ eventId, patch })

export const buildEventViewersPayload = (eventId: string, viewers: EventViewer[]) => ({
  eventId,
  scope: 'admin:event-viewers',
  viewers,
})

export const buildConnectionCountPayload = (scope: ConnectionCountScope, count: number) => ({ count, scope })

export const toEventViewers = (connections: WebSocketConnection[]): EventViewer[] => {
  const viewersById = new Map<string, EventViewer>()

  for (const connection of connections) {
    if (!connection.userId || viewersById.has(connection.userId)) continue
    viewersById.set(connection.userId, { userId: connection.userId })
  }

  return [...viewersById.values()].sort((a, b) => a.userId.localeCompare(b.userId, 'fi'))
}
