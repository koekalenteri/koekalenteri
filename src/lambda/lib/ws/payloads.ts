import type { JsonDogEvent, JsonRegistration, Patch } from '../../../types'
import type { EventPatchPayload, RegistrationPatchPayload, WebSocketConnection } from './types'

type ConnectionCountScope = 'public:connection-count' | 'admin:connection-count'

export const buildEventPatchPayload = (eventId: string, patch: Patch<JsonDogEvent>): EventPatchPayload => ({
  eventId,
  ...patch,
})

export const buildRegistrationPatchPayload = (
  eventId: string,
  patch: Patch<JsonRegistration>[]
): RegistrationPatchPayload => ({ eventId, patch })

export const buildEventViewersPayload = (eventId: string, viewers: string[]) => ({
  eventId,
  scope: 'admin:event-viewers',
  viewers,
})

export const buildConnectionCountPayload = (scope: ConnectionCountScope, count: number) => ({ count, scope })

export const toEventViewers = (connections: WebSocketConnection[]): string[] => {
  const userIds = new Set<string>()

  for (const { userId } of connections) {
    if (userId) userIds.add(userId)
  }

  return [...userIds]
}
