import type { WebSocketConnection } from '../types/webscoket'
import { LambdaError } from '../lib/lambda'
import { eventReadPort } from '../registration/api'
import { publishEventViewers } from './broadcastService'
import { isConnectionExpired } from './connectionPolicy'
import { getConnection, subscribeConnection, unsubscribeConnection } from './connectionRepository'

export const subscribeToEvent = async (connection: WebSocketConnection, eventId: string) => {
  if (isConnectionExpired(connection)) {
    throw new LambdaError(401, 'Connection expired')
  }

  const previousEventId = connection.eventId
  const event = await eventReadPort.getConfirmedEvent(eventId)

  if (!connection.admin && !connection.memberOf?.includes(event.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  await subscribeConnection(connection.connectionId, eventId)

  if (previousEventId && previousEventId !== eventId) {
    const previousEvent = await eventReadPort.getConfirmedEvent(previousEventId)
    await publishEventViewers(previousEventId, previousEvent.organizer.id)
  }

  await publishEventViewers(eventId, event.organizer.id)

  return { eventId, subscribed: true }
}

export const unsubscribeFromEvent = async (connectionId: string) => {
  const connection = await getConnection(connectionId)

  await unsubscribeConnection(connectionId)

  if (connection?.eventId) {
    const event = await eventReadPort.getConfirmedEvent(connection.eventId)
    await publishEventViewers(connection.eventId, event.organizer.id)
  }
}
