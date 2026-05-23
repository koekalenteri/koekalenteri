import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useWebSocket } from './useWebSocket'

interface EventViewer {
  userId: string
  name: string
}

interface AdminWebSocketContextValue {
  subscribe: (eventId: string) => void
  unsubscribe: () => void
  viewers: EventViewer[]
}

const AdminWebSocketContext = createContext<AdminWebSocketContextValue | null>(null)

/**
 * Provides a single shared admin WebSocket connection for the entire admin
 * section.  Mount this once at the admin shell level (AdminHomePage) and let
 * child pages call `useAdminWebSocketSubscription` to change the subscribed
 * event without opening a second connection.
 */
export function AdminWebSocketProvider({ children }: { children: ReactNode }) {
  const [eventId, setEventId] = useState<string | undefined>()
  const { viewers } = useWebSocket(true, eventId)

  const subscribe = useCallback((id: string) => setEventId(id), [])
  const unsubscribe = useCallback(() => setEventId(undefined), [])

  return (
    <AdminWebSocketContext.Provider value={{ subscribe, unsubscribe, viewers }}>
      {children}
    </AdminWebSocketContext.Provider>
  )
}

/**
 * Subscribe to a specific event via the shared admin WebSocket.
 * Must be rendered inside `AdminWebSocketProvider`.
 *
 * Sends a subscribe message on mount / when `eventId` changes and an
 * unsubscribe message on unmount, without opening a second connection.
 *
 * @returns `{ viewers }` — other users currently viewing the same event.
 */
export function useAdminWebSocketSubscription(eventId: string) {
  const ctx = useContext(AdminWebSocketContext)
  if (!ctx) throw new Error('useAdminWebSocketSubscription must be used within AdminWebSocketProvider')

  const { subscribe, unsubscribe, viewers } = ctx

  useEffect(() => {
    subscribe(eventId)
    return () => {
      unsubscribe()
    }
  }, [eventId, subscribe, unsubscribe])

  return { viewers }
}
