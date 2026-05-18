export interface WebSocketConnection {
  connectionId: string
  admin?: boolean
  eventId?: string
  expiresAt?: number
  memberOf?: string[]
  userId?: string
}
