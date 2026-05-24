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
  const userIds = new Set<string>()

  for (const { userId } of connections) {
    if (userId) userIds.add(userId)
  }

  return [...userIds]
}
