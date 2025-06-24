import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'

import { broadcastConnectionCount, wsDisconnect } from '../lib/broadcast'

const wsDisconnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  await wsDisconnect(connectionId)
  await broadcastConnectionCount()

  return { statusCode: 200, body: 'Disonnected' }
}

export default wsDisconnectHandler
