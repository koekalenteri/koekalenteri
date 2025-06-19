import type { PublicDogEvent } from '../types'

import { useCallback, useEffect, useRef } from 'react'
import { useRecoilCallback } from 'recoil'

import { patchMerge } from '../lib/utils'
import { eventsAtom } from '../pages/recoil'
import { WS_API_URL } from '../routeConfig'

const RECONNECT_INTERVAL = 1000

/**
 * Exported for testing
 */
export const applyPatch = (events: PublicDogEvent[], eventId: string, patch: Partial<PublicDogEvent>) => {
  let changed = false
  const next = events.map((e) => {
    if (e.id !== eventId) return e
    const merged = patchMerge(e, patch)
    if (merged !== e) changed = true
    return merged
  })

  return changed ? next : events
}

export const useWebSocket = () => {
  const setEvents = useRecoilCallback(
    ({ set }) =>
      (eventId: string, patch: Partial<PublicDogEvent>) => {
        set(eventsAtom, (current) => applyPatch(current, eventId, patch))
      },
    []
  )
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttempts = useRef(0)

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_API_URL)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttempts.current = 0
    }

    ws.onclose = () => {
      // Try to reconnect with exponential backoff
      const delay = Math.min(30000, RECONNECT_INTERVAL * 2 ** reconnectAttempts.current)
      reconnectAttempts.current++
      reconnectTimeoutRef.current = window.setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.debug('ws: ', data)

        if (data.eventId) {
          const { eventId, ...patch } = data
          setEvents(eventId, patch)
        }
      } catch {
        // ignore invalid messages
      }
    }
  }, [])

  useEffect(() => {
    if (WS_API_URL) {
      connect()
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  })
}
