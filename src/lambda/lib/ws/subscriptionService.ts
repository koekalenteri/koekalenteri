import type { JsonDogEvent } from '../../../types'
import type { WebSocketConnection } from './types'
import { getEvent } from '../../lib/event'
import { LambdaError } from '../../lib/lambda'
import { canReceiveAnyAdminEvent, isConnectionExpired } from './connectionPolicy'
import {
  subscribeAdminChannel,
  subscribeConnection,
  unsubscribeAdminChannel,
  unsubscribeConnection,
} from './connectionRepository'

type PublishEventViewers = (
  eventId: string,
  organizerId: string,
  options?: { excludeConnectionId?: string; include?: WebSocketConnection }
) => Promise<unknown>

export const subscribeToAdmin = async (connection: WebSocketConnection) => {
  if (isConnectionExpired(connection)) {
    throw new LambdaError(401, 'Connection expired')
  }
  if (!canReceiveAnyAdminEvent(connection)) {
    throw new LambdaError(403, 'Forbidden')
  }

  await subscribeAdminChannel(connection.connectionId)
  return { adminSubscribed: true }
}

export const subscribeToEvent = async (
  connection: WebSocketConnection,
  eventId: string,
  publishEventViewers: PublishEventViewers
) => {
  if (isConnectionExpired(connection)) {
    throw new LambdaError(401, 'Connection expired')
  }

  const previousEventId = connection.eventId
  const event = await getEvent<JsonDogEvent>(eventId)

  if (!connection.admin && !connection.memberOf?.includes(event.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  await subscribeConnection(connection.connectionId, eventId)
  const subscribedConnection = { ...connection, eventId }

  if (previousEventId && previousEventId !== eventId) {
    const previousEvent = await getEvent<JsonDogEvent>(previousEventId)
    await publishEventViewers(previousEventId, previousEvent.organizer.id)
  }

  await publishEventViewers(eventId, event.organizer.id, { include: subscribedConnection })

  return { eventId, subscribed: true }
}

export const unsubscribeFromEvent = async (
  connection: WebSocketConnection,
  publishEventViewers: PublishEventViewers
) => {
  const { connectionId } = connection

  await unsubscribeConnection(connectionId)

  if (connection?.eventId) {
    const event = await getEvent<JsonDogEvent>(connection.eventId)
    await publishEventViewers(connection.eventId, event.organizer.id, { excludeConnectionId: connectionId })
  }
}

export const unsubscribeFromAdmin = async (connectionId: string) => {
  await unsubscribeAdminChannel(connectionId)
  return { adminSubscribed: false }
}
