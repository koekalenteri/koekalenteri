import type { PublicRegistration, PublicStartList } from '../types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { APIError } from '../api/http'
import { getStartList } from '../api/registration'
import {
  isStartListUpToDate,
  newestStartListVersion,
  parseStartListVersion,
  START_LIST_VERSION_HEADER,
} from '../lib/startList'
import { usePublicStartListSubscription } from './usePublicStartListSubscription'

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

/**
 * Fetches the list on its own request, never joining one already in flight: the signal keeps the
 * http layer from coalescing it, so the answer is read after the message that asked for it.
 *
 * Not available (404) means nothing is published, which a live message sends as no rows, so it is
 * taken as just that. Any other failure was already retried and reported by the http layer; the
 * next message brings the list.
 */
const fetchStartList = async (eventId: string, signal: AbortSignal): Promise<PublicStartList | undefined> => {
  try {
    return await getStartList(eventId, undefined, signal)
  } catch (error) {
    if (error instanceof APIError && error.status === 404) {
      return { participants: [], version: parseStartListVersion(error.headers.get(START_LIST_VERSION_HEADER)) }
    }
    return undefined
  }
}

/**
 * The published start list of an event, kept current over the WebSocket (KOE-1358) and in order
 * (KOE-1516).
 *
 * Every list carries `version`, the server time its rows were read, and the newest one wins. A
 * message that cannot be used as it is (too large for one message, or unversioned once versions are
 * in use, i.e. sent by a Lambda from before them during a deploy) is answered with a fetch instead.
 * That fetch starts after the message arrived, so it read after the message did: a versioned answer
 * counts as at least as new as the newest version known when it started, whatever its own stamp
 * says. Only a list that arrived while it was in flight can outrank it. An unversioned answer comes
 * from a GetStartList from before versions, which read eventually consistent, so it stays
 * unversioned.
 */
export function usePublicStartList(eventId: string | undefined, loaded: PublicStartList): PublicRegistration[] {
  const [shown, setShown] = useState<ShownStartList>(() => ({ eventId, ...loaded }))
  const shownRef = useRef(shown)
  const eventIdRef = useRef(eventId)
  eventIdRef.current = eventId
  const fetchingRef = useRef<{ controller: AbortController; eventId: string } | undefined>(undefined)

  const offer = useCallback((forEventId: string | undefined, offered: PublicStartList) => {
    // An answer for the event the page has left must not take the place of the next one's rows.
    if (forEventId !== eventIdRef.current) return
    const next = nextShownStartList(shownRef.current, forEventId, offered)
    if (next === shownRef.current) return
    shownRef.current = next
    setShown(next)
  }, [])

  useEffect(() => offer(eventId, loaded), [eventId, loaded, offer])

  // Leaving the event, or the page, cancels the event's fetches.
  useEffect(() => {
    if (!eventId) return
    return () => {
      const fetching = fetchingRef.current
      if (fetching?.eventId !== eventId) return
      fetching.controller.abort()
      fetchingRef.current = undefined
    }
  }, [eventId])

  const refetch = useCallback(
    (forEventId: string, floor: number | undefined) => {
      let fetching = fetchingRef.current
      if (fetching?.eventId !== forEventId) {
        fetching = { controller: new AbortController(), eventId: forEventId }
        fetchingRef.current = fetching
      }
      void fetchStartList(forEventId, fetching.controller.signal).then((fetched) => {
        if (!fetched) return
        const version = fetched.version === undefined ? undefined : newestStartListVersion(fetched.version, floor)
        offer(forEventId, { ...fetched, version })
      })
    },
    [offer]
  )

  const handleLiveParticipants = useCallback(
    (fresh: PublicRegistration[] | undefined, version: number | undefined, messageEventId: string) => {
      // The handler is replaced on render but the subscription only on the next effect, so in between
      // a message for the event the page has left can reach the next event's handler (KOE-1516).
      if (messageEventId !== eventIdRef.current) return
      const shownVersion = shownRef.current.version
      if (fresh && (version !== undefined || shownVersion === undefined)) {
        offer(messageEventId, { participants: fresh, version })
        return
      }
      refetch(messageEventId, newestStartListVersion(version, shownVersion))
    },
    [offer, refetch]
  )
  usePublicStartListSubscription(eventId, handleLiveParticipants)

  // Until the loader's rows for a new event are taken in, the previous event's must not show.
  return shown.eventId === eventId ? shown.participants : loaded.participants
}
