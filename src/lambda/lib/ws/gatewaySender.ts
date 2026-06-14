import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi'
import { CONFIG } from '../../config'
import { isAwsServiceError } from '../../lib/api-gw'

export type SendOutcome = 'sent' | 'gone' | 'failed'

const createGateway = () => new ApiGatewayManagementApiClient({ endpoint: CONFIG.wsApiEndpoint })

export const sendToConnection = async (
  connectionId: string,
  data: Buffer,
  gateway: ApiGatewayManagementApiClient = createGateway()
): Promise<SendOutcome> => {
  try {
    await gateway.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: data }))
    return 'sent'
  } catch (err: unknown) {
    if (isAwsServiceError(err) && err.name === 'GoneException') return 'gone'
    console.error('broadcast:', err)
    return 'failed'
  }
}
