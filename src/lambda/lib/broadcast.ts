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
        Key: { connectionId: { S: CONNECTION_COUNT_ID } },
        UpdateExpression: 'ADD connectionCount :delta',
        ExpressionAttributeValues: { ':delta': { N: '1' } },
      },
    },
  ])
}

export const wsDisconnect = async (connectionId: string) => {
  console.log(`wsDisconnect: ${connectionId}`)
  await dynamoDB.transaction([
    {
      Delete: {
        Key: { connectionId: { S: connectionId } },
        // This will make the transaction fail, when item does not exist:
        ConditionExpression: 'attribute_exists(connectionId)',
      },
    },
    {
      Update: {
        Key: { connectionId: { S: CONNECTION_COUNT_ID } },
        UpdateExpression: 'ADD connectionCount :delta',
        ExpressionAttributeValues: { ':delta': { N: '-1' } },
      },
    },
  ])
}

export const broadcastEvent = async (data: AnyObject) => {
  const gateway = new ApiGatewayManagementApiClient({ endpoint: CONFIG.wsApiEndpoint })
  const connections = (await dynamoDB.readAll<WebSocketConnection>()) ?? []
  const dataBuffer = Buffer.from(JSON.stringify(data))

  console.log(`broadcast (${connections.length}):`, data)

  await Promise.allSettled(
    connections.map(async ({ connectionId }) => {
      if (connectionId === CONNECTION_COUNT_ID) return
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

export const broadcastConnectionCount = async () => {
  const count = await dynamoDB.read<{ connectionId: string; connectionCount: number }>({
    connectionId: CONNECTION_COUNT_ID,
  })

  if (count) {
    await broadcastEvent({ count: count.connectionCount })
  }
}
