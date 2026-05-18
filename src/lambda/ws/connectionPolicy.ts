import type { WebSocketConnection } from '../types/webscoket'
import { CONNECTION_COUNT_ID } from './types'

const nowEpochSeconds = () => Math.floor(Date.now() / 1000)

export const isConnectionExpired = (connection: WebSocketConnection) =>
  typeof connection.expiresAt === 'number' && connection.expiresAt <= nowEpochSeconds()

export const canReceiveAdminEvent = (connection: WebSocketConnection, organizerId?: string) => {
  if (connection.connectionId === CONNECTION_COUNT_ID) return false
  if (isConnectionExpired(connection)) return false
  if (connection.admin) return true
  if (!organizerId) return false

  return connection.memberOf?.includes(organizerId) ?? false
}

export const canReceivePublicEvent = (connection: WebSocketConnection) => {
  if (connection.connectionId === CONNECTION_COUNT_ID) return false
  if (isConnectionExpired(connection)) return false

  return true
}
