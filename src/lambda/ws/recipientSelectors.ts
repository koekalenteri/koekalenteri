import type { WebSocketConnection } from '../types/webscoket'
import type { EventViewer } from './types'
import { canReceiveAdminEvent, canReceivePublicEvent } from './connectionPolicy'

export const selectPublicConnections = (connections: WebSocketConnection[]) =>
  connections.filter((connection) => canReceivePublicEvent(connection))

export const selectAdminConnections = (connections: WebSocketConnection[], organizerId: string) =>
  connections.filter((connection) => canReceiveAdminEvent(connection, organizerId))

export const selectEventScopedAdminConnections = (
  connections: WebSocketConnection[],
  eventId: string,
  organizerId: string
) => connections.filter((connection) => connection.eventId === eventId && canReceiveAdminEvent(connection, organizerId))

export const toEventViewers = (connections: WebSocketConnection[]): EventViewer[] => {
  const viewersById = new Map<string, EventViewer>()

  for (const connection of connections) {
    if (!connection.userId || viewersById.has(connection.userId)) continue

    viewersById.set(connection.userId, { userId: connection.userId })
  }

  return [...viewersById.values()].sort((a, b) => a.userId.localeCompare(b.userId, 'fi'))
}
