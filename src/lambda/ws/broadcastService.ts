import type { DeepPartial, JsonDogEvent, JsonRegistration } from '../../types'
import type { WebSocketConnection } from '../types/webscoket'
import type { BroadcastPlan, EventScopedAdminPayload } from './types'
import { eventReadPort } from '../registration/api'
import {
  createConnection,
  getConnection,
  getConnectionCount,
  listConnections,
  removeConnection,
} from './connectionRepository'
import { configureDisconnectHandler, publishJson } from './gatewayPublisher'
import {
  buildConnectionCountPayload,
  buildEventPatchPayload,
  buildEventViewersPayload,
  buildRegistrationPatchPayload,
} from './payloads'
import {
  selectAdminConnections,
  selectEventScopedAdminConnections,
  selectPublicConnections,
  toEventViewers,
} from './recipientSelectors'
import { subscribeToEvent, unsubscribeFromEvent } from './subscriptionService'

const broadcastWithPlan = async <TPayload>(
  createPlan: (connections: WebSocketConnection[]) => BroadcastPlan<TPayload>,
  exceptConnectionId?: string,
  log?: (plan: BroadcastPlan<TPayload>, totalConnections: number) => void
) => {
  const connections = await listConnections()
  const plan = createPlan(connections)

  log?.(plan, connections.length)

  await publishJson(plan.recipients, plan.payload, exceptConnectionId)
}

const broadcastAdminScope = async <TPayload>(
  organizerId: string,
  payload: TPayload,
  exceptConnectionId?: string,
  log?: (plan: BroadcastPlan<TPayload>, totalConnections: number) => void
) =>
  broadcastWithPlan(
    (connections) => ({ payload, recipients: selectAdminConnections(connections, organizerId) }),
    exceptConnectionId,
    log
  )

const broadcastEventScopedAdmin = async <TPayload extends EventScopedAdminPayload>(
  organizerId: string,
  payload: TPayload,
  exceptConnectionId?: string
) =>
  broadcastWithPlan(
    (connections) => ({
      payload,
      recipients: selectEventScopedAdminConnections(connections, payload.eventId, organizerId),
    }),
    exceptConnectionId
  )

export const connectWebSocket = async (connection: WebSocketConnection) => {
  console.log(`wsConnect: ${connection.connectionId}`, connection)
  await createConnection(connection)
}

export const getWebSocketConnection = async (connectionId: string) => getConnection(connectionId)

export const disconnectWebSocket = async (connectionId: string) => {
  console.log(`wsDisconnect: ${connectionId}`)

  const connection = await getConnection(connectionId)
  await removeConnection(connectionId)

  if (connection?.eventId) {
    const event = await eventReadPort.getConfirmedEvent(connection.eventId)
    await publishEventViewers(connection.eventId, event.organizer.id)
  }

  return connection
}

configureDisconnectHandler(disconnectWebSocket)

export const subscribeWebSocketToEvent = subscribeToEvent
export const unsubscribeWebSocketFromEvent = unsubscribeFromEvent

export const publishPublicEvent = async (
  patch: Partial<Pick<JsonDogEvent, 'classes' | 'entries' | 'members'>> & { eventId: string },
  exceptConnectionId?: string
) =>
  broadcastWithPlan(
    (connections) => ({
      payload: buildEventPatchPayload(patch.eventId, patch),
      recipients: selectPublicConnections(connections),
    }),
    exceptConnectionId,
    (_plan, totalConnections) => {
      console.log(`broadcast (${totalConnections}):`, patch)
    }
  )

export const publishAdminEventPatch = async (
  patch: Partial<Pick<JsonDogEvent, 'classes' | 'entries' | 'members'>> & { eventId: string },
  organizerId: string,
  exceptConnectionId?: string
) => {
  await broadcastAdminScope(
    organizerId,
    buildEventPatchPayload(patch.eventId, patch),
    exceptConnectionId,
    (plan, total) => {
      console.log(`broadcast admin (${plan.recipients.length}/${total}):`, { organizerId, patch })
    }
  )
}

export const publishRegistrationPatches = async (
  eventId: string,
  patch: DeepPartial<JsonRegistration>[],
  organizerId: string,
  exceptConnectionId?: string
) => {
  await broadcastEventScopedAdmin(
    organizerId,
    { scope: 'admin:event-registrations', ...buildRegistrationPatchPayload(eventId, patch) },
    exceptConnectionId
  )
}

export const publishEventViewers = async (eventId: string, organizerId: string, exceptConnectionId?: string) => {
  await broadcastWithPlan((connections) => {
    const recipients = selectEventScopedAdminConnections(connections, eventId, organizerId)
    return { payload: buildEventViewersPayload(eventId, toEventViewers(recipients)), recipients }
  }, exceptConnectionId)
}

export const publishConnectionCount = async (exceptConnectionId?: string) => {
  const count = await getConnectionCount()

  if (count && count.connectionCount > 0) {
    await broadcastWithPlan(
      (connections) => ({
        payload: buildConnectionCountPayload(count.connectionCount),
        recipients: selectPublicConnections(connections),
      }),
      exceptConnectionId
    )
  }
}
