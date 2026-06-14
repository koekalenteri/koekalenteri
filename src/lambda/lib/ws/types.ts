import type { DeepPartial, JsonDogEvent, JsonRegistration } from '../../../types'

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

export type EventPatchPayload = Partial<JsonDogEvent> & {
  eventId: string
}

export type RegistrationPatchPayload = {
  eventId: string
  patch: DeepPartial<JsonRegistration>[]
}
