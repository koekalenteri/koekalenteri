import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { disconnectWebSocket, publishConnectionCount } from '../ws/broadcastService'

const wsDisconnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  await disconnectWebSocket(connectionId)
  await publishConnectionCount()

  return { body: 'Disonnected', statusCode: 200 }
}

export default wsDisconnectHandler
