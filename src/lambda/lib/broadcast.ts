import type { AnyObject } from '../../lib/utils'
import type { WebSocketConnection } from '../types/webscoket'
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

export const CONNECTION_COUNT_ID = '__count__'

export const wsConnect = async (connectionId: string) => {
  console.log(`wsConnect: ${connectionId}`)
  await dynamoDB.transaction([
    {
      Put: {
        Item: { connectionId: { S: connectionId } },
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

export const wsDisconnect = async (connectionId: string) => {
  console.log(`wsDisconnect: ${connectionId}`)
  await dynamoDB.transaction([
    {
      Delete: {
        // This will make the transaction fail, when item does not exist:
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

export const broadcastEvent = async (data: AnyObject, exceptConnectionId?: string) => {
  const gateway = new ApiGatewayManagementApiClient({ endpoint: CONFIG.wsApiEndpoint })
  const connections = (await dynamoDB.readAll<WebSocketConnection>()) ?? []
  const dataBuffer = Buffer.from(JSON.stringify(data))

  console.log(`broadcast (${connections.length}):`, data)

  await Promise.allSettled(
    connections.map(async ({ connectionId }) => {
      if (connectionId === CONNECTION_COUNT_ID || connectionId === exceptConnectionId) return
      try {
        await gateway.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: dataBuffer }))
      } catch (err: any) {
        console.error('broadcast:', err)
        if (err.name === 'GoneException') {
          await wsDisconnect(connectionId)
        }
      }
    })
  )
}

export const broadcastConnectionCount = async (exceptConnectionId?: string) => {
  const count = await dynamoDB.read<{ connectionId: string; connectionCount: number }>({
    connectionId: CONNECTION_COUNT_ID,
  })

  if (count && count.connectionCount > 0) {
    await broadcastEvent({ count: count.connectionCount }, exceptConnectionId)
  }
}
