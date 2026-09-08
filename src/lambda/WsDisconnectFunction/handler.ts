import { httpError, wsLambda } from '../lib/lambda'
import { publishEventViewers } from '../lib/ws/actions'
import { disconnectWebSocket } from '../lib/ws/connectionLifecycle'

const wsDisconnectHandler = wsLambda('wsDisconnect', async (event) => {
  const connectionId = event.requestContext.connectionId

  if (!connectionId) throw httpError(400, 'Bad request')

  await disconnectWebSocket(connectionId, {
    notifyEventViewers: async (eventId, organizerId) => {
      await publishEventViewers(eventId, organizerId)
    },
  })

  return { body: 'Disconnected', statusCode: 200 }
})

export default wsDisconnectHandler
