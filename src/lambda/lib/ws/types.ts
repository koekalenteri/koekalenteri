import type { JsonDogEvent, JsonRegistration, Patch } from '../../../types'

export interface WebSocketConnection {
  connectionId: string
  admin?: boolean
  adminSubscribed?: boolean
  audience?: 'admin' | 'public'
  eventId?: string
  expiresAt?: number
  memberOf?: string[]
  userEmail?: string
  userId?: string
  userName?: string
}

export interface EventViewerPayload {
  name: string
  userId: string
}

export type EventPatchPayload = Patch<JsonDogEvent> & {
  eventId: string
}

export type RegistrationPatchPayload = {
  eventId: string
  patch: Patch<JsonRegistration>[]
}
