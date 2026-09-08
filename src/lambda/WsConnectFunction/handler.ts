import { httpError, wsLambda } from '../lib/lambda'
import { connectWebSocket } from '../lib/ws/connectionLifecycle'

const wsConnectHandler = wsLambda('wsConnect', async (event) => {
  const connectionId = event.requestContext.connectionId

  if (!connectionId) throw httpError(400, 'Bad request')

  await connectWebSocket({ connectionId })

  return { body: 'Connected', statusCode: 200 }
})

export default wsConnectHandler
