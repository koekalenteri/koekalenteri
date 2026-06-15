import type { DogEvent, JsonDogEvent, Patch, PublicDogEvent, Registration } from '../types'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRecoilCallback, useRecoilValueLoadable } from 'recoil'
import { sanitizeDogEvent } from '../lib/event'
import { applyPatch, applyPatchesById, applyPatchOrInsert, getPatchChangedIds, parseJSON } from '../lib/utils'
import { adminEventsAtom } from '../pages/admin/recoil/events'
import { adminEventRegistrationsAtom } from '../pages/admin/recoil/registrations/atoms'
import { websocketAdminUsersSelector } from '../pages/admin/recoil/user/selectors'
import { idTokenAtom } from '../pages/recoil'
import { eventsAtom } from '../pages/recoil/events/atoms'
import { useMarkRecentlyUpdated } from '../pages/recoil/recentUpdates'
import { userSelector } from '../pages/recoil/user/selectors'
import { WS_API_URL } from '../routeConfig'

const RECONNECT_INTERVAL = 1000

export const applyRegistrations = (registrations: Registration[], next: Registration[]) => {
  if (registrations === next) return registrations
  return next
}

export const applyRegistrationPatches = (registrations: Registration[], patch: Patch<Registration>[]): Registration[] =>
  applyPatchesById(registrations, patch)

const isInsertablePublicEventPatch = (
  patch: Patch<PublicDogEvent>
): patch is Patch<PublicDogEvent> & Pick<PublicDogEvent, 'state'> =>
  patch.state !== undefined &&
  patch.state !== null &&
  patch.state !== 'draft' &&
  !!patch.eventType &&
  !!patch.location &&
  !!patch.organizer?.id &&
  !!patch.organizer.name &&
  patch.startDate instanceof Date &&
  patch.endDate instanceof Date &&
  Array.isArray(patch.classes) &&
  Array.isArray(patch.judges)

export const getRegistrationPatchChangedIds = (registrations: Registration[], patch: Patch<Registration>[]): string[] =>
  getPatchChangedIds(registrations, patch)

interface EventViewer {
  userId: string
  name: string
}

interface EventPatchMessage {
  eventId: string
  scope?: string
  [key: string]: unknown
}

const getViewerUserIds = (viewers: unknown[]): string[] =>
  viewers.filter((viewer: unknown): viewer is string => typeof viewer === 'string')

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
  const adminUsersLoadable = useRecoilValueLoadable(websocketAdminUsersSelector)
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

  const idTokenReady = idTokenLoadable.state === 'hasValue' && typeof idTokenLoadable.contents !== 'object'
  const idToken = idTokenReady ? idTokenLoadable.contents : idTokenRef.current

  idTokenRef.current = idToken
  adminUsersRef.current = adminUsers
  currentUserRef.current = currentUser

  const setPublicEvents = useRecoilCallback(
    ({ snapshot, set }) =>
      (eventId: string, patch: Patch<PublicDogEvent>, options?: { insert?: boolean }) => {
        const loadable = snapshot.getLoadable(eventsAtom)
        if (loadable.state !== 'hasValue') return

        if (patch.state === 'draft') {
          const next = loadable.contents.filter((event) => event.id !== eventId)
          if (next.length === loadable.contents.length) return

          markRecentlyUpdated('public:event', eventId)
          set(eventsAtom, next)
          return
        }

        const insert = options?.insert ?? true
        const next = insert
          ? applyPatchOrInsert(loadable.contents, eventId, patch)
          : applyPatch(loadable.contents, eventId, patch)
        if (next !== loadable.contents) markRecentlyUpdated('public:event', eventId)
        set(eventsAtom, next)
      },
    [markRecentlyUpdated]
  )
  const setAdminEvents = useRecoilCallback(
    ({ snapshot, set }) =>
      (eventId: string, patch: Patch<DogEvent>) => {
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
      (nextEventId: string, patch: Patch<Registration>[]) => {
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
  const previousTokenRef = useRef<string | undefined>(idTokenRef.current)
  const tokenEffectInitializedRef = useRef(false)

  const resolvedViewers = useMemo(
    () => mapEventViewers(rawViewersRef.current, adminUsers, currentUser),
    [adminUsers, currentUser]
  )

  const sendIfOpen = useCallback((msg: object, socket = wsRef.current) => {
    if (socket?.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(msg)
      console.debug('ws: send', msg)
      socket.send(payload)
      return true
    }
    console.debug('ws: send skipped, socket not open', { message: msg, readyState: socket?.readyState })
    return false
  }, [])

  const resendActiveSubscriptions = useCallback(
    (socket = wsRef.current) => {
      if (adminSubscribedRef.current) {
        sendIfOpen({ action: 'subscribe', channel: 'admin' }, socket)
      }
      if (eventIdRef.current) {
        sendIfOpen({ action: 'subscribe', channel: 'event', eventId: eventIdRef.current }, socket)
      }
    },
    [sendIfOpen]
  )

  const subscribeAdmin = useCallback(() => {
    adminSubscribedRef.current = true
    sendIfOpen({ action: 'subscribe', channel: 'admin' })
  }, [sendIfOpen])

  const subscribeEvent = useCallback(
    (eventId: string) => {
      const previous = eventIdRef.current
      console.debug('ws:event subscribe requested', { eventId, previous })
      if (previous && previous !== eventId) {
        rawViewersRef.current = []
        setViewers([])
      }
      eventIdRef.current = eventId
      const sent = sendIfOpen({ action: 'subscribe', channel: 'event', eventId })
      console.debug('ws:event subscribe state updated', { eventId, sent })
    },
    [sendIfOpen]
  )

  const unsubscribeEvent = useCallback(() => {
    const eventId = eventIdRef.current
    console.debug('ws:event unsubscribe requested', { eventId })
    if (!eventId) return
    const sent = sendIfOpen({ action: 'unsubscribe', channel: 'event' })
    eventIdRef.current = undefined
    rawViewersRef.current = []
    setViewers([])
    console.debug('ws:event unsubscribe state cleared', { eventId, sent })
  }, [sendIfOpen])

  const handleCountMessage = useCallback((data: { count?: unknown; scope?: unknown }) => {
    if (typeof data.count !== 'number') return false

    if (data.scope === 'public:connection-count') setPublicCount(data.count)
    else if (data.scope === 'admin:connection-count') setAdminCount(data.count)

    return true
  }, [])

  const handleEventPatchMessage = useCallback(
    ({ eventId, scope, ...patch }: EventPatchMessage) => {
      if (scope === 'admin:event-patch') {
        const eventPatch = patch as Patch<JsonDogEvent>
        setAdminEvents(eventId, eventPatch as unknown as Patch<DogEvent>)
        const publicPatch = sanitizeDogEvent(eventPatch) as unknown as Patch<PublicDogEvent>
        if (Object.keys(publicPatch).length > 0) {
          setPublicEvents(eventId, publicPatch, { insert: isInsertablePublicEventPatch(publicPatch) })
        }
        return
      }

      if (scope === 'public:event-patch' || !scope) {
        setPublicEvents(eventId, patch as Patch<PublicDogEvent>)
      }
    },
    [setAdminEvents, setPublicEvents]
  )

  const handleMessageData = useCallback(
    (data: any, token: string | undefined, ws: WebSocket) => {
      console.debug('ws: ', data)

      if (handleCountMessage(data)) return

      if (data.scope === 'admin:event-registrations' && data.eventId && Array.isArray(data.patch)) {
        patchRegistrations(data.eventId, data.patch)
        return
      }

      if (data.scope === 'admin:event-viewers' && data.eventId && Array.isArray(data.viewers)) {
        const viewerUserIds = getViewerUserIds(data.viewers)
        rawViewersRef.current = viewerUserIds
        const nextViewers = mapEventViewers(viewerUserIds, adminUsersRef.current, currentUserRef.current)
        setViewers((current) => applyViewers(current, nextViewers))
        return
      }

      if (data.authenticated === true) {
        authFailedTokenRef.current = undefined
        resendActiveSubscriptions(ws)
        return
      }

      if (data.ok === false && (data.status === 401 || data.status === 403)) {
        if (token) authFailedTokenRef.current = token
        shouldReconnectRef.current = false
        ws.close()
        return
      }

      if (data.eventId) {
        handleEventPatchMessage(data)
      }
    },
    [handleCountMessage, handleEventPatchMessage, patchRegistrations, resendActiveSubscriptions]
  )

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return

    const token = idTokenRef.current
    if (token && authFailedTokenRef.current === token) return

    const ws = new WebSocket(WS_API_URL)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttempts.current = 0

      if (token) {
        // Subscriptions are (re)sent after the backend acknowledges authentication,
        // because the lambda authorizes subscribe based on the persisted connection
        // record written during authenticate.
        sendIfOpen({ action: 'authenticate', token }, ws)
        return
      }

      // Re-send all active subscriptions after reconnect (unauthenticated channels)
      resendActiveSubscriptions(ws)
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
        handleMessageData(parseJSON(event.data), token, ws)
      } catch {
        // ignore invalid messages
      }
    }
  }, [handleMessageData, resendActiveSubscriptions, sendIfOpen])

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

  useEffect(() => {
    if (!idTokenReady) return

    const previousToken = previousTokenRef.current
    const nextToken = idToken

    if (!tokenEffectInitializedRef.current) {
      tokenEffectInitializedRef.current = true
      previousTokenRef.current = nextToken
      return
    }

    if (previousToken === nextToken) return

    console.debug('ws: auth token changed', {
      hadPreviousToken: Boolean(previousToken),
      hasNextToken: Boolean(nextToken),
    })

    previousTokenRef.current = nextToken
    authFailedTokenRef.current = undefined
    shouldReconnectRef.current = true

    if (!nextToken) {
      adminSubscribedRef.current = false
      eventIdRef.current = undefined
      rawViewersRef.current = []
      setViewers([])
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    const previousSocket = wsRef.current
    wsRef.current = null
    previousSocket?.close()

    if (WS_API_URL) {
      connect()
    }
  }, [connect, idToken, idTokenReady])

  return { adminCount, publicCount, subscribeAdmin, subscribeEvent, unsubscribeEvent, viewers }
}

export const useWebSocketContext = (): WebSocketContextValue => {
  const ctx = useContext(WebSocketContext)
  if (!ctx) throw new Error('useWebSocketContext must be used within WebSocketProvider')
  return ctx
}
