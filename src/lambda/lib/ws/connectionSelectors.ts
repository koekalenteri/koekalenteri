import type { WebSocketConnection } from './types'
import { canReceiveAdminEvent, canReceiveAnyAdminEvent } from './connectionPolicy'
import { queryAuthenticatedConnections, queryPublicConnections } from './connectionRepository'

export const publicAudience = async () => queryPublicConnections()

export const organizerAudience = async (organizerId: string, eventId: string) =>
  (await queryAuthenticatedConnections()).filter(
    (connection) =>
      canReceiveAdminEvent(connection, organizerId) && (connection.adminSubscribed || connection.eventId === eventId)
  )

export const adminAudience = async () =>
  (await queryAuthenticatedConnections()).filter(
    (connection) => connection.adminSubscribed && canReceiveAnyAdminEvent(connection)
  )

const includeConnection = (connections: WebSocketConnection[], connection?: WebSocketConnection) => {
  if (!connection || connections.some(({ connectionId }) => connectionId === connection.connectionId))
    return connections
  return [...connections, connection]
}

const excludeConnection = (connections: WebSocketConnection[], connectionId?: string) => {
  if (!connectionId) return connections
  return connections.filter((connection) => connection.connectionId !== connectionId)
}

export const eventAudience = async (
  eventId: string,
  organizerId: string,
  options: { excludeConnectionId?: string; include?: WebSocketConnection } = {}
) =>
  includeConnection(
    excludeConnection(
      (await queryAuthenticatedConnections()).filter(
        (connection) => connection.eventId === eventId && canReceiveAdminEvent(connection, organizerId)
      ),
      options.excludeConnectionId
    ),
    options.include?.eventId === eventId && canReceiveAdminEvent(options.include, organizerId)
      ? options.include
      : undefined
  )
