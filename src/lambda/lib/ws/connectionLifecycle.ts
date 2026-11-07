import type { JsonDogEvent } from '../../../types'
import type { WebSocketConnection } from './types'
import { getEvent } from '../../lib/event'
import { LambdaError } from '../../lib/lambda'
import { hashIdentity, logger } from '../../lib/log'
import {
  authenticateConnection,
  countOpenConnectionsInSourceBucket,
  countOpenPublicConnections,
  createConnection,
  getConnection,
  removeConnection,
} from './connectionRepository'
import { bestEffort } from './livePush'

type NotifyEventViewers = (eventId: string, organizerId: string) => Promise<unknown>

const MAX_PUBLIC_CONNECTIONS = 1000
const MAX_CONNECTIONS_PER_SOURCE_BUCKET = 20
const SOURCE_BUCKET_HEX_CHARS = 5
const API_GATEWAY_WEBSOCKET_MAX_CONNECTION_SECONDS = 2 * 60 * 60

const expiresAtForMaxGatewayLifetime = () =>
  Math.floor(Date.now() / 1000) + API_GATEWAY_WEBSOCKET_MAX_CONNECTION_SECONDS

/**
 * Truncated to 20 bits on purpose: the full hash of an IPv4 address can be reversed by trying every
 * address, and the value reaches the row and the log lines of its queries. Some 4096 addresses share
 * a bucket, so it says little about any one of them, and neighbours in a bucket share the limit.
 */
const sourceBucketOf = (sourceIp: string) => hashIdentity(sourceIp).slice(0, SOURCE_BUCKET_HEX_CHARS)

/** A connection without a source (an empty `sourceIp` cannot be an index key) is checked only against the public cap. */
export const connectWebSocket = async (connection: WebSocketConnection, sourceIp?: string) => {
  logger.info('wsConnect', { connectionId: connection.connectionId })

  // First, so a source at its limit costs one small count and not the public one.
  const sourceBucket = sourceIp ? sourceBucketOf(sourceIp) : undefined
  if (
    sourceBucket &&
    (await countOpenConnectionsInSourceBucket(sourceBucket, MAX_CONNECTIONS_PER_SOURCE_BUCKET)) >=
      MAX_CONNECTIONS_PER_SOURCE_BUCKET
  ) {
    throw new LambdaError(429, 'Too many websocket connections from one source')
  }

  if ((await countOpenPublicConnections(MAX_PUBLIC_CONNECTIONS)) >= MAX_PUBLIC_CONNECTIONS) {
    throw new LambdaError(429, 'Too many public websocket connections')
  }

  await createConnection({ ...connection, expiresAt: expiresAtForMaxGatewayLifetime(), sourceBucket })
}

export const authenticateWebSocket = async (connection: WebSocketConnection) => {
  if (!connection.userId) throw new Error('Cannot authenticate websocket connection without userId')

  // The email is hashed and the name left out: the connection is identified by userId, and the
  // hash is only there to tie a person's connections together while looking into a problem.
  logger.info('wsAuthenticate', {
    admin: connection.admin,
    connectionId: connection.connectionId,
    emailHash: connection.userEmail ? hashIdentity(connection.userEmail) : undefined,
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
  logger.info('wsDisconnect', { connectionId })

  const connection = await getConnection(connectionId)
  await removeConnection(connectionId)

  const eventId = connection?.eventId
  const notifyEventViewers = deps?.notifyEventViewers
  if (eventId && notifyEventViewers) {
    // A live push after the stored disconnect, the event's read with it.
    await bestEffort('event viewers', async () => {
      const event = await getEvent<JsonDogEvent>(eventId)
      await notifyEventViewers(eventId, event.organizer.id)
    })
  }

  return connection
}
