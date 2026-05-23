import type { WebSocketConnection } from './types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

export const listConnections = async () => (await dynamoDB.readAll<WebSocketConnection>()) ?? []

export const getConnection = async (connectionId: string) => dynamoDB.read<WebSocketConnection>({ connectionId })

export const createConnection = async ({ connectionId }: Pick<WebSocketConnection, 'connectionId'>) => {
  await dynamoDB.write({ audience: 'public' as const, connectionId })
}

export const authenticateConnection = async ({ admin, connectionId, expiresAt, memberOf, userId }: WebSocketConnection) => {
  if (!userId) throw new Error('Cannot authenticate websocket connection without userId')

  await dynamoDB.update(
    { connectionId },
    {
      remove: ['eventId'],
      set: {
        ...(typeof admin === 'boolean' ? { admin } : {}),
        audience: 'auth' as const,
        ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
        ...(memberOf?.length ? { memberOf } : {}),
        userId,
      },
    }
  )
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

const queryConnectionsByAudience = async (audience: NonNullable<WebSocketConnection['audience']>) =>
  (await dynamoDB.query<WebSocketConnection>({
    index: 'audience-index',
    key: 'audience = :audience',
    values: { ':audience': audience },
  })) ?? []

export const queryAuthenticatedConnections = async () => queryConnectionsByAudience('auth')

export const queryPublicConnections = async () => queryConnectionsByAudience('public')
