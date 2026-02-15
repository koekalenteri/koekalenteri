import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { broadcastConnectionCount, wsDisconnect } from '../lib/broadcast'

const wsDisconnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  await wsDisconnect(connectionId)
  await broadcastConnectionCount()

  return { body: 'Disonnected', statusCode: 200 }
}

export default wsDisconnectHandler
