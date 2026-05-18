import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { response } from '../lib/lambda'
import { subscribeWebSocketToEvent, unsubscribeWebSocketFromEvent } from '../lib/ws/actions'
import { getWebSocketConnection } from '../lib/ws/connectionLifecycle'

interface WsMessage {
  action?: 'subscribe' | 'unsubscribe'
  eventId?: string
}

const parseBody = (body: string | null): WsMessage | undefined => {
  if (!body) return undefined
  try {
    const parsed = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as WsMessage
  } catch {
    return undefined
  }
}

const wsMessageHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId
  const message = parseBody(event.body)

  if (!connectionId || !message) {
    return response(400, 'Bad request', event)
  }

  const connection = await getWebSocketConnection(connectionId)
  if (!connection) {
    return response(400, 'Bad request', event)
  }

  if (message.action === 'subscribe') {
    if (typeof message.eventId !== 'string' || message.eventId.trim().length === 0) {
      return response(400, 'Bad request', event)
    }
    const result = await subscribeWebSocketToEvent(connection, message.eventId)

    return response(200, result, event)
  }

  if (message.action === 'unsubscribe') {
    if (!connection.eventId) {
      return response(400, 'Bad request', event)
    }
    await unsubscribeWebSocketFromEvent(connectionId)

    return response(200, { connectionId, unsubscribed: true }, event)
  }

  return response(400, 'Bad request', event)
}

export default wsMessageHandler
