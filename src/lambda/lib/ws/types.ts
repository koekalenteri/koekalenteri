import type { JsonDogEvent, JsonRegistration, Patch } from '../../../types'

export interface WebSocketConnection {
  connectionId: string
  admin?: boolean
  adminSubscribed?: boolean
  audience?: 'admin' | 'public'
  eventId?: string
  expiresAt?: number
  memberOf?: string[]
  userId?: string
}

export type EventPatchPayload = Patch<JsonDogEvent> & {
  eventId: string
}

export type RegistrationPatchPayload = {
  eventId: string
  patch: Patch<JsonRegistration>[]
}
