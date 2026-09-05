import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { LambdaError } from '../lib/lambda'
import { withLogContext } from '../lib/log'
import { connectWebSocket } from '../lib/ws/connectionLifecycle'

const wsConnectHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId

  if (!connectionId) {
    return { body: 'Bad request', statusCode: 400 }
  }

  // The socket lambdas get no `lambda()` wrapper, so the log context is set here. Both ids are
  // worth having: the request id collects one invocation, the connection id one socket's whole life.
  return withLogContext({ connectionId, requestId: event.requestContext.requestId, service: 'wsConnect' }, async () => {
    try {
      await connectWebSocket({ connectionId })
    } catch (err) {
      if (err instanceof LambdaError) {
        return { body: err.error ?? 'WebSocket connection failed', statusCode: err.status }
      }
      throw err
    }

    return { body: 'Connected', statusCode: 200 }
  })
}

export default wsConnectHandler
