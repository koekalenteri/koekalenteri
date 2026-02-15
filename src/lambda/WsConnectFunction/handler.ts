import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { broadcastConnectionCount, wsConnect } from '../lib/broadcast'

const wsConnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  await wsConnect(connectionId)
  await broadcastConnectionCount(connectionId)

  return { body: 'Connected', statusCode: 200 }
}

export default wsConnectHandler
