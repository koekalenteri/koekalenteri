import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { LambdaError, response } from '../lib/lambda'
import {
  subscribeWebSocketToAdmin,
  subscribeWebSocketToEvent,
  unsubscribeWebSocketFromAdmin,
  unsubscribeWebSocketFromEvent,
} from '../lib/ws/actions'
import { authenticateWebSocketToken } from '../lib/ws/authentication'
import { authenticateWebSocket, getWebSocketConnection } from '../lib/ws/connectionLifecycle'

interface WsMessage {
  action?: 'authenticate' | 'subscribe' | 'unsubscribe'
  channel?: 'admin' | 'event'
  eventId?: string
  token?: string
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

  try {
    if (message.action === 'authenticate') {
      if (typeof message.token !== 'string' || message.token.trim().length === 0) {
        return response(400, 'Bad request', event)
      }
      const auth = await authenticateWebSocketToken(event, message.token)
      await authenticateWebSocket({ connectionId, ...auth })

      return response(200, { authenticated: true, ...auth }, event)
    }

    if (message.action === 'subscribe') {
      if (message.channel === 'admin') {
        const result = await subscribeWebSocketToAdmin(connection)
        return response(200, result, event)
      }

      if (message.channel === 'event') {
        if (typeof message.eventId !== 'string' || message.eventId.trim().length === 0) {
          return response(400, 'Bad request', event)
        }
        const result = await subscribeWebSocketToEvent(connection, message.eventId)

        return response(200, result, event)
      }

      return response(400, 'Bad request', event)
    }

    if (message.action === 'unsubscribe') {
      if (message.channel === 'admin') {
        const result = await unsubscribeWebSocketFromAdmin(connectionId)
        return response(200, { connectionId, ...result }, event)
      }

      if (message.channel === 'event') {
        if (!connection.eventId) {
          return response(400, 'Bad request', event)
        }
        await unsubscribeWebSocketFromEvent(connectionId)

        return response(200, { connectionId, unsubscribed: true }, event)
      }

      return response(400, 'Bad request', event)
    }
  } catch (err) {
    console.error(err)
    if (err instanceof LambdaError) {
      return response(200, { error: err.error, ok: false, status: err.status }, event)
    }
    return response(200, { error: 'Internal server error', ok: false, status: 500 }, event)
  }

  return response(400, 'Bad request', event)
}

export default wsMessageHandler
