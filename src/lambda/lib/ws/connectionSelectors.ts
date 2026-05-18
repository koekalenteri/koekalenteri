import { canReceiveAdminEvent, canReceivePublicEvent } from './connectionPolicy'
import { listConnections, queryAuthenticatedConnections } from './connectionRepository'

export const publicAudience = async () =>
  (await listConnections()).filter((connection) => canReceivePublicEvent(connection))

export const organizerAudience = async (organizerId: string) =>
  (await queryAuthenticatedConnections()).filter((connection) => canReceiveAdminEvent(connection, organizerId))

export const eventAudience = async (eventId: string, organizerId: string) =>
  (await queryAuthenticatedConnections()).filter(
    (connection) => connection.eventId === eventId && canReceiveAdminEvent(connection, organizerId)
  )
