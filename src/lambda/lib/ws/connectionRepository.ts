import type { WebSocketConnection } from './types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

export const listConnections = async () => (await dynamoDB.readAll<WebSocketConnection>()) ?? []

export const getConnection = async (connectionId: string) => dynamoDB.read<WebSocketConnection>({ connectionId })

export const createConnection = async ({ admin, connectionId, expiresAt, memberOf, userId }: WebSocketConnection) => {
  await dynamoDB.write({
    ...(typeof admin === 'boolean' ? { admin } : {}),
    ...(userId ? { audience: 'auth' as const } : {}),
    connectionId,
    ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
    ...(memberOf?.length ? { memberOf } : {}),
    ...(userId ? { userId } : {}),
  })
}

export const subscribeConnection = async (connectionId: string, eventId: string) => {
  await dynamoDB.update({ connectionId }, { set: { eventId } })
}

export const subscribeAdminChannel = async (connectionId: string) => {
  await dynamoDB.update({ connectionId }, { set: { adminSubscribed: true } })
}

export const unsubscribeAdminChannel = async (connectionId: string) => {
  await dynamoDB.update({ connectionId }, { remove: ['adminSubscribed'] })
}

export const unsubscribeConnection = async (connectionId: string) => {
  await dynamoDB.update({ connectionId }, { remove: ['eventId'] })
}

export const removeConnection = async (connectionId: string) => {
  const existing = await getConnection(connectionId)
  if (!existing) return

  await dynamoDB.delete({ connectionId })
}

export const queryAuthenticatedConnections = async () =>
  (await dynamoDB.query<WebSocketConnection>({
    index: 'audience-index',
    key: 'audience = :audience',
    values: { ':audience': 'auth' },
  })) ?? []
