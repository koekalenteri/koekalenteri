import { useEffect } from 'react'
import { useWebSocketContext } from './useWebSocket'

/**
 * Subscribe to the admin channel on the shared WebSocket.
 *
 * The subscription is **sticky**: it is sent on mount and NOT cleaned up on
 * unmount. Once an admin opens the admin section, admin event patches keep
 * arriving regardless of which page they navigate to, keeping Recoil atoms
 * up-to-date in the background until logout / token expiry.
 *
 * Must be rendered inside `WebSocketProvider`.
 */
export function useAdminSubscription() {
  const { subscribeAdmin } = useWebSocketContext()

  useEffect(() => {
    subscribeAdmin()
    // No cleanup — subscription is intentionally sticky for the session
  }, [subscribeAdmin])
}
