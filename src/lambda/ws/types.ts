import type { DeepPartial, JsonDogEvent, JsonRegistration } from '../../types'
import type { WebSocketConnection } from '../types/webscoket'

export const CONNECTION_COUNT_ID = '__count__'

export type EventPatchPayload = Partial<Pick<JsonDogEvent, 'classes' | 'entries' | 'members'>> & {
  eventId: string
}

export type RegistrationPatchPayload = {
  eventId: string
  patch: DeepPartial<JsonRegistration>[]
}

export type EventViewer = {
  userId: string
}

export type BroadcastTarget = Pick<WebSocketConnection, 'connectionId'>

export type BroadcastPlan<TPayload> = {
  payload: TPayload
  recipients: WebSocketConnection[]
}

export type EventScopedAdminPayload = { eventId: string; scope: string }
