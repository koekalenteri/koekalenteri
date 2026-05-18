import type { WebSocketConnection } from './types'

const nowEpochSeconds = () => Math.floor(Date.now() / 1000)

export const isConnectionExpired = (connection: WebSocketConnection) =>
  typeof connection.expiresAt === 'number' && connection.expiresAt <= nowEpochSeconds()

export const canReceiveAdminEvent = (connection: WebSocketConnection, organizerId?: string) => {
  if (isConnectionExpired(connection)) return false
  if (connection.admin) return true
  if (!organizerId) return false

  return connection.memberOf?.includes(organizerId) ?? false
}

export const canReceivePublicEvent = (connection: WebSocketConnection) => {
  if (isConnectionExpired(connection)) return false

  return true
}
