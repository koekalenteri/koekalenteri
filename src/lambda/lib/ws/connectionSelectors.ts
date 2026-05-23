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

export const eventAudience = async (eventId: string, organizerId: string) =>
  (await queryAuthenticatedConnections()).filter(
    (connection) => connection.eventId === eventId && canReceiveAdminEvent(connection, organizerId)
  )
