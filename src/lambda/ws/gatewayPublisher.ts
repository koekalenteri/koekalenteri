import type { BroadcastTarget } from './types'
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi'
import { CONFIG } from '../config'

let disconnectConnection: ((connectionId: string) => Promise<unknown>) | undefined

export const configureDisconnectHandler = (handler: (connectionId: string) => Promise<unknown>) => {
  disconnectConnection = handler
}

const createGateway = () => new ApiGatewayManagementApiClient({ endpoint: CONFIG.wsApiEndpoint })

const sendPayload = async (
  connections: BroadcastTarget[],
  dataBuffer: Buffer,
  exceptConnectionId?: string,
  gateway = createGateway()
) => {
  await Promise.allSettled(
    connections.map(async ({ connectionId }) => {
      if (connectionId === exceptConnectionId) return
      try {
        await gateway.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: dataBuffer }))
      } catch (err: any) {
        console.error('broadcast:', err)
        if (err.name === 'GoneException') {
          await disconnectConnection?.(connectionId)
        }
      }
    })
  )
}

export const publishJson = async <TPayload>(
  connections: BroadcastTarget[],
  payload: TPayload,
  exceptConnectionId?: string,
  gateway = createGateway()
) => sendPayload(connections, Buffer.from(JSON.stringify(payload)), exceptConnectionId, gateway)
