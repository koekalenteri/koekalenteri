import type { AnyObject } from '../../lib/utils'
import type { WebSocketConnection } from '../types/webscoket'

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.wsConnectionsTable)

export const broadcastEvent = async (data: AnyObject) => {
  const gateway = new ApiGatewayManagementApiClient({ endpoint: CONFIG.wsApiEndpoint })
  const connections = (await dynamoDB.readAll<WebSocketConnection>()) ?? []
  const dataBuffer = Buffer.from(JSON.stringify(data))

  await Promise.all(
    connections.map(async ({ connectionId }) => {
      try {
        await gateway.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: dataBuffer }))
      } catch (err: any) {
        if (err.name === 'GoneException') {
          await dynamoDB.delete({ connectionId })
        }
      }
    })
  )
}
