import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { LambdaError } from '../lib/lambda'
import { publishConnectionCounts } from '../lib/ws/actions'
import { connectWebSocket } from '../lib/ws/connectionLifecycle'

const wsConnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId

  if (!connectionId) {
    return { body: 'Bad request', statusCode: 400 }
  }

  try {
    await connectWebSocket({ connectionId })
    await publishConnectionCounts([connectionId])
  } catch (err) {
    if (err instanceof LambdaError) {
      return { body: err.error ?? 'WebSocket connection failed', statusCode: err.status }
    }
    throw err
  }

  return { body: 'Connected', statusCode: 200 }
}

export default wsConnectHandler
