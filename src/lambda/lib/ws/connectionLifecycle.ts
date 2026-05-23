import type { JsonDogEvent } from '../../../types'
import type { WebSocketConnection } from './types'
import { getEvent } from '../../lib/event'
import { authenticateConnection, createConnection, getConnection, removeConnection } from './connectionRepository'

type NotifyEventViewers = (eventId: string, organizerId: string) => Promise<unknown>

export const connectWebSocket = async (connection: WebSocketConnection) => {
  console.log(`wsConnect: ${connection.connectionId}`, connection)
  await createConnection(connection)
}

export const authenticateWebSocket = async (connection: WebSocketConnection) => {
  if (!connection.userId) throw new Error('Cannot authenticate websocket connection without userId')

  console.log(`wsAuthenticate: ${connection.connectionId}`, {
    admin: connection.admin,
    connectionId: connection.connectionId,
    expiresAt: connection.expiresAt,
    memberOf: connection.memberOf,
    userId: connection.userId,
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
