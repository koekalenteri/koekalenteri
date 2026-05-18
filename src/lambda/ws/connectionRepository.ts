import type { WebSocketConnection } from '../types/webscoket'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { CONNECTION_COUNT_ID } from './types'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

export const listConnections = async () => (await dynamoDB.readAll<WebSocketConnection>()) ?? []

export const getConnection = async (connectionId: string) => dynamoDB.read<WebSocketConnection>({ connectionId })

export const createConnection = async ({ admin, connectionId, expiresAt, memberOf, userId }: WebSocketConnection) => {
  await dynamoDB.transaction([
    {
      Put: {
        Item: {
          ...(typeof admin === 'boolean' ? { admin: { BOOL: admin } } : {}),
          connectionId: { S: connectionId },
          ...(typeof expiresAt === 'number' ? { expiresAt: { N: String(expiresAt) } } : {}),
          ...(memberOf?.length ? { memberOf: { SS: memberOf } } : {}),
          ...(userId ? { userId: { S: userId } } : {}),
        },
      },
    },
    {
      Update: {
        ExpressionAttributeValues: { ':delta': { N: '1' } },
        Key: { connectionId: { S: CONNECTION_COUNT_ID } },
        UpdateExpression: 'ADD connectionCount :delta',
      },
    },
  ])
}

export const subscribeConnection = async (connectionId: string, eventId: string) => {
  await dynamoDB.update({ connectionId }, { set: { eventId } })
}

export const unsubscribeConnection = async (connectionId: string) => {
  await dynamoDB.update({ connectionId }, { remove: ['eventId'] })
}

export const removeConnection = async (connectionId: string) => {
  await dynamoDB.transaction([
    {
      Delete: {
        ConditionExpression: 'attribute_exists(connectionId)',
        Key: { connectionId: { S: connectionId } },
      },
    },
    {
      Update: {
        ExpressionAttributeValues: { ':delta': { N: '-1' } },
        Key: { connectionId: { S: CONNECTION_COUNT_ID } },
        UpdateExpression: 'ADD connectionCount :delta',
      },
    },
  ])
}

export const getConnectionCount = async () =>
  dynamoDB.read<{ connectionId: string; connectionCount: number }>({ connectionId: CONNECTION_COUNT_ID })
