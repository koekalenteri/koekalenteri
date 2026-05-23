import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { publishConnectionCounts, publishEventViewers } from '../lib/ws/actions'
import { disconnectWebSocket } from '../lib/ws/connectionLifecycle'

const wsDisconnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId

  if (!connectionId) {
    return { body: 'Bad request', statusCode: 400 }
  }

  await disconnectWebSocket(connectionId, {
    notifyEventViewers: async (eventId, organizerId) => {
      await publishEventViewers(eventId, organizerId)
    },
  })
  await publishConnectionCounts()

  return { body: 'Disconnected', statusCode: 200 }
}

export default wsDisconnectHandler
