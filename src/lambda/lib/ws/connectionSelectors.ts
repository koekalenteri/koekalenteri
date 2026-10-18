import type { WebSocketConnection } from './types'
import { canReceiveAdminEvent, canReceiveAnyAdminEvent, isConnectionExpired } from './connectionPolicy'
import { queryAdminConnections, queryPublicConnections } from './connectionRepository'

export const publicAudience = async () => queryPublicConnections()

export const organizerAudience = async (organizerId: string, eventId: string) =>
  (await queryAdminConnections()).filter(
    (connection) =>
      canReceiveAdminEvent(connection, organizerId) && (connection.adminSubscribed || connection.eventId === eventId)
  )

export const adminAudience = async () =>
  (await queryAdminConnections()).filter(
    (connection) => connection.adminSubscribed && canReceiveAnyAdminEvent(connection)
  )

export const eventSubscriberAudience = async (eventId: string) =>
  (await queryAdminConnections()).filter(
    (connection) => connection.eventId === eventId && !isConnectionExpired(connection)
  )

/** For subscriptions that are not an admin's: the one socket a tab has may be in either audience. */
const allConnections = async () => [...(await queryPublicConnections()), ...(await queryAdminConnections())]

/**
 * Readers of one event's published start list. Both audiences are scanned: an organizer who has the
 * admin section open in the same tab shares the one socket, and the start list they navigate to is
 * still the public one.
 */
export const publicStartListAudience = async (eventId: string) => {
  const connections = await allConnections()
  return connections.filter((connection) => connection.publicEventId === eventId && !isConnectionExpired(connection))
}

/** A connection whose page shows one registration. */
type RegistrationConnection = WebSocketConnection & { registrationId: string }

/** The entrants' pages open on any of these registrations of the event, from one scan (KOE-1553). */
export const registrationsAudience = async (eventId: string, registrationIds: readonly string[]) => {
  const ids = new Set(registrationIds)
  const connections = await allConnections()
  return connections.filter(
    (connection): connection is RegistrationConnection =>
      connection.registrationEventId === eventId &&
      connection.registrationId !== undefined &&
      ids.has(connection.registrationId) &&
      !isConnectionExpired(connection)
  )
}

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
      (await queryAdminConnections()).filter(
        (connection) => connection.eventId === eventId && canReceiveAdminEvent(connection, organizerId)
      ),
      options.excludeConnectionId
    ),
    options.include?.eventId === eventId && canReceiveAdminEvent(options.include, organizerId)
      ? options.include
      : undefined
  )
