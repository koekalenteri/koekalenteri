import type { JsonDogEvent } from '../../../types'
import type { WebSocketConnection } from './types'
import { getEvent } from '../../lib/event'
import { LambdaError } from '../../lib/lambda'
import {
  authenticateConnection,
  createConnection,
  getConnection,
  queryPublicConnections,
  removeConnection,
} from './connectionRepository'

type NotifyEventViewers = (eventId: string, organizerId: string) => Promise<unknown>

const MAX_PUBLIC_CONNECTIONS = 1000
const API_GATEWAY_WEBSOCKET_MAX_CONNECTION_SECONDS = 2 * 60 * 60

const expiresAtForMaxGatewayLifetime = () =>
  Math.floor(Date.now() / 1000) + API_GATEWAY_WEBSOCKET_MAX_CONNECTION_SECONDS

export const connectWebSocket = async (connection: WebSocketConnection) => {
  console.log(`wsConnect: ${connection.connectionId}`, connection)

  const publicConnections = await queryPublicConnections()
  if (publicConnections.length >= MAX_PUBLIC_CONNECTIONS) {
    throw new LambdaError(429, 'Too many public websocket connections')
  }

  await createConnection({ ...connection, expiresAt: expiresAtForMaxGatewayLifetime() })
}

export const authenticateWebSocket = async (connection: WebSocketConnection) => {
  if (!connection.userId) throw new Error('Cannot authenticate websocket connection without userId')

  console.log(`wsAuthenticate: ${connection.connectionId}`, {
    admin: connection.admin,
    connectionId: connection.connectionId,
    expiresAt: connection.expiresAt,
    memberOf: connection.memberOf,
    userEmail: connection.userEmail,
    userId: connection.userId,
    userName: connection.userName,
  })
  await authenticateConnection(connection)
}

export const getWebSocketConnection = async (connectionId: string) => getConnection(connectionId)

export const disconnectWebSocket = async (
  connectionId: string,
  deps?: {
    notifyEventViewers?: NotifyEventViewers
  }
) => {
  console.log(`wsDisconnect: ${connectionId}`)

  const connection = await getConnection(connectionId)
  await removeConnection(connectionId)

  if (connection?.eventId && deps?.notifyEventViewers) {
    try {
      const event = await getEvent<JsonDogEvent>(connection.eventId)
      await deps.notifyEventViewers(connection.eventId, event.organizer.id)
    } catch (err: unknown) {
      console.error({ err }, 'failed to publish event viewers')
    }
  }

  return connection
}
