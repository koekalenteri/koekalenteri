import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { publishConnectionCounts } from '../lib/ws/actions'
import { connectWebSocket } from '../lib/ws/connectionLifecycle'

const wsConnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId

  if (!connectionId) {
    return { body: 'Bad request', statusCode: 400 }
  }

  await connectWebSocket({ connectionId })
  await publishConnectionCounts([connectionId])

  return { body: 'Connected', statusCode: 200 }
}

export default wsConnectHandler
