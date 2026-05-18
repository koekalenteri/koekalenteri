import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { publishConnectionCount, publishEventViewers } from '../lib/ws/actions'
import { disconnectWebSocket } from '../lib/ws/connectionLifecycle'

const wsDisconnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!

  await disconnectWebSocket(connectionId, {
    notifyEventViewers: async (eventId, organizerId) => {
      await publishEventViewers(eventId, organizerId)
    },
  })
  await publishConnectionCount()

  return { body: 'Disonnected', statusCode: 200 }
}

export default wsDisconnectHandler
