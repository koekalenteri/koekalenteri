import type { DeepPartial, DogEvent, PublicDogEvent, Registration } from '../types'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRecoilCallback, useRecoilValueLoadable } from 'recoil'
import { sanitizeDogEvent } from '../lib/event'
import { parseJSON, patchMerge } from '../lib/utils'
import { adminEventsAtom } from '../pages/admin/recoil/events'
import { adminEventRegistrationsAtom } from '../pages/admin/recoil/registrations/atoms'
import { adminUsersAtom } from '../pages/admin/recoil/user/atoms'
import { idTokenAtom } from '../pages/recoil'
import { eventsAtom } from '../pages/recoil/events/atoms'
import { useMarkRecentlyUpdated } from '../pages/recoil/recentUpdates'
import { userSelector } from '../pages/recoil/user/selectors'
import { WS_API_URL } from '../routeConfig'

const RECONNECT_INTERVAL = 1000

/**
 * Exported for testing
 */
export const applyPatch = <T extends { id: string }, P extends DeepPartial<T>>(
  events: T[],
  eventId: string,
  patch: P
): T[] => {
  let changed = false
  const next = events.map((e) => {
    if (e.id !== eventId) return e
    const merged: T = patchMerge(e, patch)
    if (merged !== e) changed = true
    return merged
  })

  return changed ? next : events
}

export const applyPatchOrInsert = <T extends { id: string }, P extends DeepPartial<T>>(
  events: T[],
  eventId: string,
  patch: P
): T[] => {
  const next = applyPatch(events, eventId, patch)
  if (next !== events || events.some((event) => event.id === eventId)) return next

  return [...events, { ...patch, id: eventId } as unknown as T]
}

export const applyRegistrations = (registrations: Registration[], next: Registration[]) => {
  if (registrations === next) return registrations
  return next
}

export const applyRegistrationPatches = (
  registrations: Registration[],
  patch: DeepPartial<Registration>[]
): Registration[] => {
  if (!patch.length) return registrations

  const patchesById = new Map(
    patch.filter((item): item is DeepPartial<Registration> & { id: string } => !!item.id).map((item) => [item.id, item])
  )
  let changed = false

  const next = registrations.map((registration) => {
    const registrationPatch = patchesById.get(registration.id)
    if (!registrationPatch) return registration

    const merged = patchMerge(registration, registrationPatch)
    if (merged !== registration) changed = true
    return merged
  })

  return changed ? next : registrations
}

export const getRegistrationPatchChangedIds = (
  registrations: Registration[],
  patch: DeepPartial<Registration>[]
): string[] => {
  if (!patch.length) return []

  const patchesById = new Map(
    patch.filter((item): item is DeepPartial<Registration> & { id: string } => !!item.id).map((item) => [item.id, item])
  )

  return registrations.flatMap((registration) => {
    const registrationPatch = patchesById.get(registration.id)
    if (!registrationPatch) return []

    return patchMerge(registration, registrationPatch) !== registration ? [registration.id] : []
  })
}

interface EventViewer {
  userId: string
  name: string
}

const mapEventViewers = (
  viewers: string[],
  adminUsers: Array<{ id: string; name?: string }>,
  currentUser?: { id: string; name?: string }
) => {
  const usersById = new Map(adminUsers.map((user) => [user.id, user] as const))
  if (currentUser?.id) {
    usersById.set(currentUser.id, currentUser)
  }

  return viewers.map((userId) => ({
    name: usersById.get(userId)?.name ?? userId,
    userId,
  }))
}

export const applyViewers = (current: EventViewer[], next: EventViewer[]) => {
  if (
    current.length === next.length &&
    current.every((viewer, index) => viewer.userId === next[index]?.userId && viewer.name === next[index]?.name)
  ) {
    return current
  }

  return next
}

// ── Context ──────────────────────────────────────────────────────────────────

interface WebSocketContextValue {
  publicCount: number
  adminCount: number
  viewers: EventViewer[]
  subscribeAdmin: () => void
  subscribeEvent: (eventId: string) => void
  unsubscribeEvent: () => void
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(null)

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useWebSocket = () => {
  const idTokenLoadable = useRecoilValueLoadable(idTokenAtom)
  const adminUsersLoadable = useRecoilValueLoadable(adminUsersAtom)
  const currentUserLoadable = useRecoilValueLoadable(userSelector)
  const markRecentlyUpdated = useMarkRecentlyUpdated()
  const shouldReconnectRef = useRef(true)

  // Subscription state — persisted across reconnects
  const adminSubscribedRef = useRef(false)
  const eventIdRef = useRef<string | undefined>(undefined)
  const rawViewersRef = useRef<string[]>([])

  // Mutable refs for values only needed inside callbacks
  const idTokenRef = useRef<string | undefined>(undefined)
  const adminUsersRef = useRef<Array<{ id: string; name?: string }>>([])
  const currentUserRef = useRef<{ id: string; name?: string } | undefined>(undefined)
  const authFailedTokenRef = useRef<string | undefined>(undefined)

  const adminUsers = adminUsersLoadable.state === 'hasValue' ? adminUsersLoadable.contents : []
  const currentUser =
    currentUserLoadable.state === 'hasValue' && currentUserLoadable.contents?.id
      ? currentUserLoadable.contents
      : undefined

  idTokenRef.current = idTokenLoadable.state === 'hasValue' ? idTokenLoadable.contents : undefined
  adminUsersRef.current = adminUsers
  currentUserRef.current = currentUser

  const setPublicEvents = useRecoilCallback(
    ({ snapshot, set }) =>
      (eventId: string, patch: Partial<PublicDogEvent>) => {
        const loadable = snapshot.getLoadable(eventsAtom)
        if (loadable.state !== 'hasValue') return

        const next = applyPatchOrInsert(loadable.contents, eventId, patch)
        if (next !== loadable.contents) markRecentlyUpdated('public:event', eventId)
        set(eventsAtom, next)
      },
    [markRecentlyUpdated]
  )
  const setAdminEvents = useRecoilCallback(
    ({ snapshot, set }) =>
      (eventId: string, patch: Partial<DogEvent>) => {
        const loadable = snapshot.getLoadable(adminEventsAtom)
        if (loadable.state !== 'hasValue') return

        const next = applyPatchOrInsert(loadable.contents, eventId, patch)
        if (next !== loadable.contents) markRecentlyUpdated('admin:event', eventId)
        set(adminEventsAtom, next)
      },
    [markRecentlyUpdated]
  )
  const patchRegistrations = useRecoilCallback(
    ({ snapshot, set }) =>
      (nextEventId: string, patch: DeepPartial<Registration>[]) => {
        const loadable = snapshot.getLoadable(adminEventRegistrationsAtom(nextEventId))
        if (loadable.state !== 'hasValue') return

        const next = applyRegistrationPatches(loadable.contents, patch)
        if (next !== loadable.contents) {
          for (const registrationId of getRegistrationPatchChangedIds(loadable.contents, patch)) {
            markRecentlyUpdated('admin:registration', registrationId)
          }
        }
        set(adminEventRegistrationsAtom(nextEventId), next)
      },
    [markRecentlyUpdated]
  )

  const [publicCount, setPublicCount] = useState(0)
  const [adminCount, setAdminCount] = useState(0)
  const [viewers, setViewers] = useState<EventViewer[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)

  const resolvedViewers = useMemo(
    () => mapEventViewers(rawViewersRef.current, adminUsers, currentUser),
    [adminUsers, currentUser]
  )

  const sendIfOpen = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const subscribeAdmin = useCallback(() => {
    adminSubscribedRef.current = true
    sendIfOpen({ action: 'subscribe', channel: 'admin' })
  }, [sendIfOpen])

  const subscribeEvent = useCallback(
    (eventId: string) => {
      const previous = eventIdRef.current
      if (previous && previous !== eventId) {
        rawViewersRef.current = []
        setViewers([])
      }
      eventIdRef.current = eventId
      sendIfOpen({ action: 'subscribe', channel: 'event', eventId })
    },
    [sendIfOpen]
  )

  const unsubscribeEvent = useCallback(() => {
    if (!eventIdRef.current) return
    sendIfOpen({ action: 'unsubscribe', channel: 'event' })
    eventIdRef.current = undefined
    rawViewersRef.current = []
    setViewers([])
  }, [sendIfOpen])

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return

    const token = idTokenRef.current
    if (token && authFailedTokenRef.current === token) return

    const ws = new WebSocket(WS_API_URL)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttempts.current = 0

      if (token) {
        ws.send(JSON.stringify({ action: 'authenticate', token }))
        return
      }

      // Re-send all active subscriptions after reconnect
      if (adminSubscribedRef.current) {
        ws.send(JSON.stringify({ action: 'subscribe', channel: 'admin' }))
      }
      if (eventIdRef.current) {
        ws.send(JSON.stringify({ action: 'subscribe', channel: 'event', eventId: eventIdRef.current }))
      }
    }

    ws.onclose = () => {
      if (!shouldReconnectRef.current || wsRef.current !== ws) return

      const delay = Math.min(30000, RECONNECT_INTERVAL * 2 ** reconnectAttempts.current)
      reconnectAttempts.current++
      reconnectTimeoutRef.current = globalThis.setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const data = parseJSON(event.data)
        console.debug('ws: ', data)

        if (typeof data.count === 'number') {
          if (data.scope === 'public:connection-count') setPublicCount(data.count)
          else if (data.scope === 'admin:connection-count') setAdminCount(data.count)
          return
        }

        if (data.scope === 'admin:event-registrations' && data.eventId && Array.isArray(data.patch)) {
          patchRegistrations(data.eventId, data.patch)
          return
        }

        if (data.scope === 'admin:event-viewers' && data.eventId && Array.isArray(data.viewers)) {
          const viewerUserIds = data.viewers.filter((viewer: unknown): viewer is string => typeof viewer === 'string')
          rawViewersRef.current = viewerUserIds
          const nextViewers = mapEventViewers(viewerUserIds, adminUsersRef.current, currentUserRef.current)
          setViewers((current) => applyViewers(current, nextViewers))
          return
        }

        if (data.authenticated === true) {
          authFailedTokenRef.current = undefined
          if (adminSubscribedRef.current) {
            ws.send(JSON.stringify({ action: 'subscribe', channel: 'admin' }))
          }
          if (eventIdRef.current) {
            ws.send(JSON.stringify({ action: 'subscribe', channel: 'event', eventId: eventIdRef.current }))
          }
          return
        }

        if (data.ok === false && (data.status === 401 || data.status === 403)) {
          if (token) authFailedTokenRef.current = token
          shouldReconnectRef.current = false
          ws.close()
          return
        }

        if (data.eventId) {
          const { eventId, scope, ...patch } = data
          if (scope === 'admin:event-patch') {
            setAdminEvents(eventId, patch)
            const publicPatch = sanitizeDogEvent(patch) as unknown as Partial<PublicDogEvent>
            if (Object.keys(publicPatch).length > 0) {
              setPublicEvents(eventId, publicPatch)
            }
          } else if (scope === 'public:event-patch' || !scope) {
            setPublicEvents(eventId, patch)
          }
        }
      } catch {
        // ignore invalid messages
      }
    }
  }, [patchRegistrations, setAdminEvents, setPublicEvents])

  useEffect(() => {
    setViewers((current) => applyViewers(current, resolvedViewers))
  }, [resolvedViewers])

  useEffect(() => {
    shouldReconnectRef.current = true

    if (WS_API_URL) {
      connect()
    }

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return { adminCount, publicCount, subscribeAdmin, subscribeEvent, unsubscribeEvent, viewers }
}

export const useWebSocketContext = (): WebSocketContextValue => {
  const ctx = useContext(WebSocketContext)
  if (!ctx) throw new Error('useWebSocketContext must be used within WebSocketProvider')
  return ctx
}
