import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { WebSocketConnection } from '../types/webscoket'
import { response } from '../lib/lambda'
import {
  getWebSocketConnection,
  subscribeWebSocketToEvent,
  unsubscribeWebSocketFromEvent,
} from '../ws/broadcastService'

interface WsMessage {
  action?: 'subscribe' | 'unsubscribe'
  eventId?: string
}

const parseBody = (body: string | null): WsMessage => {
  if (!body) return {}
  try {
    return JSON.parse(body) as WsMessage
  } catch {
    return {}
  }
}

const wsMessageHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!
  const message = parseBody(event.body)

  if (message.action === 'subscribe' && message.eventId) {
    const connection = (await getWebSocketConnection(connectionId)) ?? ({ connectionId } as WebSocketConnection)
    const result = await subscribeWebSocketToEvent(connection, message.eventId)
    return response(200, result, event as any)
  }

  if (message.action === 'unsubscribe') {
    await unsubscribeWebSocketFromEvent(connectionId)
    return response(200, { connectionId, unsubscribed: true }, event as any)
  }

  return response(400, 'Bad request', event as any)
}

export default wsMessageHandler
