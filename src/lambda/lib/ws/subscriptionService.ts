import type { JsonDogEvent } from '../../../types'
import type { WebSocketConnection } from './types'
import { getEvent } from '../../lib/event'
import { LambdaError } from '../../lib/lambda'
import { getRegistration, verifyRegistrationEditToken } from '../../lib/registration'
import { canReceiveAnyAdminEvent, isConnectionExpired } from './connectionPolicy'
import {
  subscribeAdminChannel,
  subscribeConnection,
  subscribePublicEventConnection,
  subscribeRegistrationConnection,
  unsubscribeAdminChannel,
  unsubscribeConnection,
  unsubscribePublicEventConnection,
  unsubscribeRegistrationConnection,
} from './connectionRepository'
import { buildParticipantPaymentPatch } from './payloads'

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

/**
 * Watching one event's published start list (KOE-1358). Nothing is authorized here on purpose: the
 * subscription only selects which readers a publicly readable list is pushed to, and the rows
 * themselves are composed from published truth alone.
 */
export const subscribeToPublicStartList = async (connectionId: string, eventId: string) => {
  await subscribePublicEventConnection(connectionId, eventId)
  return { eventId, subscribed: true }
}

export const unsubscribeFromPublicStartList = async (connectionId: string) => {
  await unsubscribePublicEventConnection(connectionId)
  return { unsubscribed: true }
}

export const unsubscribeFromAdmin = async (connectionId: string) => {
  await unsubscribeAdminChannel(connectionId)
  return { adminSubscribed: false }
}

export const subscribeToRegistration = async (
  connection: WebSocketConnection,
  eventId: string,
  registrationId: string,
  editToken: string
) => {
  if (isConnectionExpired(connection)) throw new LambdaError(401, 'Connection expired')

  const registration = await getRegistration(eventId, registrationId)
  await verifyRegistrationEditToken(registration, editToken)
  await subscribeRegistrationConnection(connection.connectionId, eventId, registrationId)
  const currentRegistration = await getRegistration(eventId, registrationId)

  return {
    eventId,
    patch: buildParticipantPaymentPatch(currentRegistration),
    registrationId,
    scope: 'participant:registration-patch',
    subscribed: true,
  }
}

export const unsubscribeFromRegistration = async (connectionId: string) => {
  await unsubscribeRegistrationConnection(connectionId)
  return { unsubscribed: true }
}
