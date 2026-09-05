import type { JsonDogEvent, JsonRegistration, Patch } from '../../../types'

export interface WebSocketConnection {
  connectionId: string
  admin?: boolean
  adminSubscribed?: boolean
  audience?: 'admin' | 'public'
  eventId?: string
  expiresAt?: number
  memberOf?: string[]
  /**
   * Event whose published start list the connection is watching (KOE-1358). Unlike `eventId` this
   * needs no authentication and leaves the connection in the `public` audience, so a reader keeps
   * receiving the public event patches that every anonymous connection gets.
   */
  publicEventId?: string
  registrationEventId?: string
  registrationId?: string
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
