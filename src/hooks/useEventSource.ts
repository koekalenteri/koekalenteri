import type { PublicDogEvent } from '../types'

import { useEffect } from 'react'
import { useRecoilCallback } from 'recoil'

import { stackName } from '../lib/env'
import { patchMerge } from '../lib/utils'
import { eventsAtom } from '../pages/recoil'

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

export const useEventSource = () => {
  const setEvents = useRecoilCallback(
    ({ set }) =>
      (eventId: string, patch: Partial<PublicDogEvent>) => {
        set(eventsAtom, (current) => applyPatch(current, eventId, patch))
      },
    []
  )

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 10
    const MAX_BACKOFF_MS = 30000 // 30 seconds max backoff

    const connect = () => {
      // Clear any existing reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
      }

      // Close existing connection if any
      if (eventSource) {
        eventSource.close()
      }

      // Create new connection
      eventSource = new EventSource(`https://sse-worker.koekalenteri.workers.dev?channel=${stackName()}`)

      eventSource.onopen = () => {
        console.log('SSE: connected')
        reconnectAttempts = 0 // Reset reconnect attempts on successful connection
      }

      eventSource.onmessage = (event) => {
        const payload = JSON.parse(event.data)
        console.debug('SSE', payload)

        if (!payload?.eventId) return

        const { eventId, ...patch } = payload
        setEvents(eventId, patch)
      }

      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err)

        // Only attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          // Close the errored connection
          if (eventSource) {
            eventSource.close()
            eventSource = null
          }

          // Exponential backoff with jitter
          reconnectAttempts++
          const baseDelay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), MAX_BACKOFF_MS)
          const jitter = Math.random() * 0.3 * baseDelay // Add up to 30% jitter
          const delay = baseDelay + jitter

          console.log(
            `SSE: reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
          )

          reconnectTimeout = setTimeout(connect, delay)
        } else {
          console.error(`SSE: giving up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`)
        }
      }
    }

    // Initial connection
    connect()

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [])
}
