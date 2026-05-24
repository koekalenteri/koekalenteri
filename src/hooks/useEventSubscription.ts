import { useEffect } from 'react'
import { useWebSocketContext } from './useWebSocket'

/**
 * Subscribe to a specific event via the shared WebSocket.
 *
 * Sends `{ action: 'subscribe', channel: 'event', eventId }` on mount / when
 * `eventId` changes and `{ action: 'unsubscribe', channel: 'event' }` on
 * unmount — without opening a second connection.
 *
 * Must be rendered inside `WebSocketProvider`.
 *
 * @returns `{ viewers }` — other users currently viewing the same event.
 */
export function useEventSubscription(eventId: string) {
  const { subscribeEvent, unsubscribeEvent, viewers } = useWebSocketContext()

  useEffect(() => {
    console.debug('ws:event-subscription mount', { eventId })
    subscribeEvent(eventId)
    return () => {
      console.debug('ws:event-subscription cleanup', { eventId })
      unsubscribeEvent()
    }
  }, [eventId, subscribeEvent, unsubscribeEvent])

  return { viewers }
}
