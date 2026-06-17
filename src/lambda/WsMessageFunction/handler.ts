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

type ValidWsMessage =
  | { action: 'authenticate'; token: string }
  | { action: 'subscribe'; channel: 'admin' }
  | { action: 'subscribe'; channel: 'event'; eventId: string }
  | { action: 'unsubscribe'; channel: 'admin' | 'event' }

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

const parseObjectMessage = (message: WsMessage): ValidWsMessage | undefined => {
  if (message.action === 'authenticate' && isNonEmptyString(message.token)) {
    return { action: 'authenticate', token: message.token }
  }

  if (message.action === 'subscribe' && message.channel === 'admin') {
    return { action: 'subscribe', channel: 'admin' }
  }

  if (message.action === 'subscribe' && message.channel === 'event' && isNonEmptyString(message.eventId)) {
    return { action: 'subscribe', channel: 'event', eventId: message.eventId }
  }

  if (message.action === 'unsubscribe' && (message.channel === 'admin' || message.channel === 'event')) {
    return { action: 'unsubscribe', channel: message.channel }
  }
}

const parseBody = (body: string | null): ValidWsMessage | undefined => {
  if (!body) return undefined
  try {
    const parsed = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parseObjectMessage(parsed as WsMessage)
  } catch {
    return undefined
  }
}

const handleSubscribeMessage = async (
  message: Extract<ValidWsMessage, { action: 'subscribe' }>,
  connection: NonNullable<Awaited<ReturnType<typeof getWebSocketConnection>>>
) => {
  if (message.channel === 'admin') return subscribeWebSocketToAdmin(connection)

  return subscribeWebSocketToEvent(connection, message.eventId)
}

const handleUnsubscribeMessage = async (
  message: Extract<ValidWsMessage, { action: 'unsubscribe' }>,
  connectionId: string,
  connection: NonNullable<Awaited<ReturnType<typeof getWebSocketConnection>>>,
  event: APIGatewayEvent
) => {
  if (message.channel === 'admin') {
    const result = await unsubscribeWebSocketFromAdmin(connectionId)
    return response(200, { connectionId, ...result }, event)
  }

  if (!connection.eventId) {
    return response(400, 'Bad request', event)
  }

  await unsubscribeWebSocketFromEvent(connection)
  return response(200, { connectionId, unsubscribed: true }, event)
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
      const auth = await authenticateWebSocketToken(event, message.token)
      await authenticateWebSocket({ connectionId, ...auth })

      return response(200, { authenticated: true, ...auth }, event)
    }

    if (message.action === 'subscribe') {
      return response(200, await handleSubscribeMessage(message, connection), event)
    }

    if (message.action === 'unsubscribe') {
      return handleUnsubscribeMessage(message, connectionId, connection, event)
    }
  } catch (err) {
    console.error(err)
    if (err instanceof LambdaError) {
      return response(err.status, { error: err.error, ok: false, status: err.status }, event)
    }
    return response(500, { error: 'Internal server error', ok: false, status: 500 }, event)
  }

  return response(400, 'Bad request', event)
}

export default wsMessageHandler
