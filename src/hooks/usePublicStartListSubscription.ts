import type { PublicStartListListener } from './useWebSocket'
import { useEffect, useRef } from 'react'
import { useWebSocketContext } from './useWebSocket'

/**
 * Subscribe to an event's published start list via the shared WebSocket (KOE-1358).
 *
 * Sends `{ action: 'subscribe', channel: 'public-event', eventId }` on mount / when `eventId`
 * changes and `{ action: 'unsubscribe', channel: 'public-event' }` on unmount. No authentication
 * is involved and the connection stays in the public audience, so it keeps receiving the event
 * patches broadcast to every anonymous reader.
 *
 * `listener` receives the published rows, or `undefined` when they did not fit in one message and
 * have to be fetched instead, and the server time they were read. Messages can arrive out of order,
 * so the listener keeps the highest version (KOE-1516). It may change on every render; the latest
 * one is always called.
 *
 * Must be rendered inside `WebSocketProvider`.
 */
export function usePublicStartListSubscription(eventId: string | undefined, listener: PublicStartListListener) {
  const { subscribePublicStartList, unsubscribePublicStartList } = useWebSocketContext()
  const listenerRef = useRef(listener)
  listenerRef.current = listener

  useEffect(() => {
    if (!eventId) return

    subscribePublicStartList(eventId, (participants, version, messageEventId) =>
      listenerRef.current(participants, version, messageEventId)
    )
    return () => unsubscribePublicStartList()
  }, [eventId, subscribePublicStartList, unsubscribePublicStartList])
}
