import type { WebSocketConnection } from './types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

export const listConnections = async () => (await dynamoDB.readAll<WebSocketConnection>()) ?? []

export const getConnection = async (connectionId: string) => dynamoDB.read<WebSocketConnection>({ connectionId })

export const createConnection = async ({
  connectionId,
  expiresAt,
}: Pick<WebSocketConnection, 'connectionId' | 'expiresAt'>) => {
  await dynamoDB.write({
    audience: 'public' as const,
    connectionId,
    ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
  })
}

export const authenticateConnection = async ({
  admin,
  connectionId,
  expiresAt,
  memberOf,
  userId,
}: WebSocketConnection) => {
  if (!userId) throw new Error('Cannot authenticate websocket connection without userId')

  await dynamoDB.update(
    { connectionId },
    {
      remove: ['eventId'],
      set: {
        ...(typeof admin === 'boolean' ? { admin } : {}),
        audience: 'public' as const,
        ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
        ...(memberOf?.length ? { memberOf } : {}),
        userId,
      },
    }
  )
}

export const subscribeConnection = async (connectionId: string, eventId: string) => {
  await dynamoDB.update({ connectionId }, { set: { audience: 'admin' as const, eventId } })
}

export const subscribeAdminChannel = async (connectionId: string) => {
  await dynamoDB.update({ connectionId }, { set: { adminSubscribed: true, audience: 'admin' as const } })
}

export const unsubscribeAdminChannel = async (connectionId: string) => {
  await dynamoDB.update({ connectionId }, { remove: ['adminSubscribed'], set: { audience: 'public' as const } })
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

export const queryAdminConnections = async () => queryConnectionsByAudience('admin')

export const queryPublicConnections = async () => queryConnectionsByAudience('public')
