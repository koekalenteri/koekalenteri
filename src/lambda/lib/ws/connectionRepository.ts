import type { WebSocketConnection } from './types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

export const getConnection = async (connectionId: string) => dynamoDB.read<WebSocketConnection>({ connectionId })

export const createConnection = async ({
  connectionId,
  expiresAt,
  sourceBucket,
}: Pick<WebSocketConnection, 'connectionId' | 'expiresAt' | 'sourceBucket'>) => {
  await dynamoDB.write({
    audience: 'public' as const,
    connectionId,
    ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
    ...(sourceBucket ? { sourceBucket } : {}),
  })
}

export const authenticateConnection = async ({
  admin,
  connectionId,
  expiresAt,
  memberOf,
  userEmail,
  userId,
  userName,
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
        ...(userEmail ? { userEmail } : {}),
        userId,
        ...(userName ? { userName } : {}),
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

/**
 * The public start list subscription deliberately leaves `audience` alone: the reader stays in the
 * `public` audience and keeps receiving the event patches broadcast to every anonymous connection.
 */
export const subscribePublicEventConnection = async (connectionId: string, publicEventId: string) => {
  await dynamoDB.update({ connectionId }, { set: { publicEventId } })
}

export const unsubscribePublicEventConnection = async (connectionId: string) => {
  await dynamoDB.update({ connectionId }, { remove: ['publicEventId'] })
}

export const subscribeRegistrationConnection = async (
  connectionId: string,
  registrationEventId: string,
  registrationId: string
) => {
  await dynamoDB.update({ connectionId }, { set: { registrationEventId, registrationId } })
}

export const unsubscribeRegistrationConnection = async (connectionId: string) => {
  await dynamoDB.update({ connectionId }, { remove: ['registrationEventId', 'registrationId'] })
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

/**
 * The rows still within `expiresAt`, so one whose `$disconnect` was lost and whose TTL deletion lags
 * holds no place. Connection rows are never soft-deleted, and source-index projects no deletedAt.
 */
const countOpenConnections = async (index: string, key: string, values: Record<string, string>, limit: number) =>
  dynamoDB.count({
    filterExpression: 'expiresAt > :now',
    includeDeleted: true,
    index,
    key,
    limit,
    values: { ...values, ':now': Math.floor(Date.now() / 1000) },
  })

export const countOpenPublicConnections = async (limit: number) =>
  countOpenConnections('audience-index', 'audience = :audience', { ':audience': 'public' }, limit)

export const countOpenConnectionsInSourceBucket = async (sourceBucket: string, limit: number) =>
  countOpenConnections('source-index', 'sourceBucket = :sourceBucket', { ':sourceBucket': sourceBucket }, limit)
