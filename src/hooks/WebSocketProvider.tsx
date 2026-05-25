import type { ReactNode } from 'react'
import { useWebSocket, WebSocketContext } from './useWebSocket'

/**
 * Mounts the single shared WebSocket connection for the entire app and makes
 * the subscribe/unsubscribe API available via React context.
 *
 * Mount this once at the top of the component tree (inside App.tsx).
 * Child components use `useWebSocketContext()`, `useAdminSubscription()`, and
 * `useEventSubscription()` to interact with the shared connection.
 */
function WebSocketProviderInner({ children }: Readonly<{ children: ReactNode }>) {
  const value = useWebSocket()

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

export default WebSocketProviderInner
