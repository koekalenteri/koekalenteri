import type { PublicRegistration, PublicStartList } from '../types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getStartList } from '../api/registration'
import { isStartListUpToDate, newestStartListVersion } from '../lib/startList'
import { usePublicStartListSubscription } from './usePublicStartListSubscription'

/** How long a failed refetch waits before its one retry. */
export const START_LIST_REFETCH_RETRY_MS = 2000

interface ShownStartList extends PublicStartList {
  eventId: string | undefined
}

/**
 * The rows to show once `offered` arrives. Live messages, the loader and a refetch race each other,
 * so rows older than the ones on screen are turned away (KOE-1516); the loader's rows for the event
 * the page has moved to always win.
 */
const nextShownStartList = (
  shown: ShownStartList,
  eventId: string | undefined,
  offered: PublicStartList
): ShownStartList => {
  if (shown.eventId !== eventId) return { eventId, ...offered }
  if (!isStartListUpToDate(shown.version, offered.version)) return shown

  return { eventId, ...offered }
}

const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Fetches the list on its own request, never joining one already in flight: the signal keeps the
 * http layer from coalescing it, so the answer is read after the message that asked for it. A
 * failure is retried once, a little later; after that the next message brings the list.
 */
const fetchStartList = async (
  eventId: string,
  signal: AbortSignal,
  retries = 1
): Promise<PublicStartList | undefined> => {
  try {
    return await getStartList(eventId, undefined, signal)
  } catch {
    if (signal.aborted || retries <= 0) return undefined
    await waitFor(START_LIST_REFETCH_RETRY_MS)
    if (signal.aborted) return undefined
    return fetchStartList(eventId, signal, retries - 1)
  }
}

/**
 * The published start list of an event, kept current over the WebSocket (KOE-1358) and in order
 * (KOE-1516).
 *
 * Every list carries `version`, the server time its rows were read, and the newest one wins. A
 * message that cannot be used as it is (too large for one message, or unversioned once versions are
 * in use, i.e. sent by a Lambda from before them during a deploy) is answered with a fetch instead.
 * That fetch starts after the message arrived, so it read after the message did: it counts as at
 * least as new as the newest version known when it started, whatever its own header says or lacks.
 * Only a list that arrived while it was in flight can outrank it.
 */
export function usePublicStartList(eventId: string | undefined, loaded: PublicStartList): PublicRegistration[] {
  const [shown, setShown] = useState<ShownStartList>(() => ({ eventId, ...loaded }))
  const shownRef = useRef(shown)
  const eventIdRef = useRef(eventId)
  eventIdRef.current = eventId
  const fetchingRef = useRef<{ eventId: string | undefined; signal: AbortSignal } | undefined>(undefined)

  const offer = useCallback((forEventId: string | undefined, offered: PublicStartList) => {
    // A fetch for the event the page has left must not put its dogs under the next one's header.
    if (forEventId !== eventIdRef.current) return
    const next = nextShownStartList(shownRef.current, forEventId, offered)
    if (next === shownRef.current) return
    shownRef.current = next
    setShown(next)
  }, [])

  useEffect(() => offer(eventId, loaded), [eventId, loaded, offer])

  // One signal per event: leaving the event cancels its refetches and their retries.
  useEffect(() => {
    const controller = new AbortController()
    fetchingRef.current = { eventId, signal: controller.signal }
    return () => controller.abort()
  }, [eventId])

  const refetch = useCallback(
    (forEventId: string, floor: number | undefined) => {
      const fetching = fetchingRef.current
      if (fetching?.eventId !== forEventId) return
      void fetchStartList(forEventId, fetching.signal).then((fetched) => {
        if (fetched) {
          offer(forEventId, { ...fetched, version: newestStartListVersion(fetched.version, floor) })
        }
      })
    },
    [offer]
  )

  const handleLiveParticipants = useCallback(
    (fresh: PublicRegistration[] | undefined, version: number | undefined) => {
      if (!eventId) return
      const shownVersion = shownRef.current.version
      if (fresh && (version !== undefined || shownVersion === undefined)) {
        offer(eventId, { participants: fresh, version })
        return
      }
      refetch(eventId, newestStartListVersion(version, shownVersion))
    },
    [eventId, offer, refetch]
  )
  usePublicStartListSubscription(eventId, handleLiveParticipants)

  // Until the loader's rows for a new event are taken in, the previous event's must not show.
  return shown.eventId === eventId ? shown.participants : loaded.participants
}
