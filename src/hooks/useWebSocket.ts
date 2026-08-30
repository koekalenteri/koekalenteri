import type {
  AdminDataCollection,
  AuditRecord,
  DogEvent,
  JsonDogEvent,
  Patch,
  PublicDogEvent,
  Registration,
} from '../types'
import { useAtomValue } from 'jotai'
import { unwrap, useAtomCallback } from 'jotai/utils'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getEmailTemplates } from '../api/email'
import { getEventTypes } from '../api/eventType'
import { getJudges } from '../api/judge'
import { getLocations } from '../api/location'
import { getOfficials } from '../api/official'
import { getAdminOrganizers } from '../api/organizer'
import { getUsers } from '../api/user'
import { compareByLocalizedString } from '../lib/client/sort'
import { sanitizeDogEvent } from '../lib/event'
import { collectionResponseCursor, collectionSince, reconcileCollection } from '../lib/incremental'
import { getIdTokenDiagnostics } from '../lib/token'
import { applyPatch, applyPatchesById, applyPatchOrInsert, getPatchChangedIds, parseJSON } from '../lib/utils'
import { adminEmailTemplatesAtom, fetchEmailTemplates } from '../pages/admin/state/emailTemplates'
import { adminEventsAtom } from '../pages/admin/state/events'
import { adminEventTypesAtom } from '../pages/admin/state/eventTypes'
import { adminJudgesAtom } from '../pages/admin/state/judges'
import { adminLocationsAtom } from '../pages/admin/state/locations'
import { adminOfficialsAtom } from '../pages/admin/state/officials'
import { adminOrganizersAtom } from '../pages/admin/state/organizers'
import { adminEventRegistrationsAtom } from '../pages/admin/state/registrations/atoms'
import { adminUsersAtom } from '../pages/admin/state/user'
import { websocketAdminUsersAtom } from '../pages/admin/state/user/derivedAtoms'
import { validIdTokenAtom } from '../pages/state'
import { eventsAtom } from '../pages/state/events/atoms'
import { useMarkRecentlyUpdated } from '../pages/state/recentUpdates'
import { userAtom } from '../pages/state/user/derivedAtoms'
import { WS_API_URL } from '../routeConfig'

const RECONNECT_INTERVAL = 1000
// API Gateway closes a WebSocket after 10 minutes without traffic, and every reconnect used to
// invoke two lambdas. Any client->server message resets the timer, so one ping well inside the
// window keeps the connection up. Route responses are not configured, so nothing comes back.
const KEEPALIVE_INTERVAL = 480_000
const validIdTokenValueAtom = unwrap(validIdTokenAtom, (previous) => previous)
const websocketAdminUsersValueAtom = unwrap(websocketAdminUsersAtom, (previous) => previous ?? [])
const userValueAtom = unwrap(userAtom, (previous) => previous)

interface WebSocketHandlers {
  connectionId: number
  handleMessage: (data: unknown) => void
  isCurrent: () => boolean
  onOpen: () => void
  onReconnect: (delay: number) => void
  resendSubscriptions: (socket: WebSocket) => void
  send: (message: object, socket: WebSocket) => boolean
  shouldReconnect: () => boolean
  socket: WebSocket
  token?: string
}

const configureWebSocket = ({
  connectionId,
  handleMessage,
  isCurrent,
  onOpen,
  onReconnect,
  resendSubscriptions,
  send,
  shouldReconnect,
  socket,
  token,
}: WebSocketHandlers) => {
  let keepAlive: ReturnType<typeof globalThis.setInterval> | undefined
  const stopKeepAlive = () => {
    if (keepAlive === undefined) return
    globalThis.clearInterval(keepAlive)
    keepAlive = undefined
  }

  socket.onopen = () => {
    if (!isCurrent()) {
      console.debug('ws: ignored stale open', { connectionId })
      socket.close()
      return
    }

    onOpen()
    keepAlive = globalThis.setInterval(() => send({ action: 'ping' }, socket), KEEPALIVE_INTERVAL)
    if (token) send({ action: 'authenticate', token }, socket)
    else resendSubscriptions(socket)
  }

  socket.onclose = () => {
    stopKeepAlive()
    if (!isCurrent()) {
      console.debug('ws: ignored stale close', { connectionId })
      return
    }
    if (shouldReconnect()) onReconnect(RECONNECT_INTERVAL)
  }

  socket.onerror = () => socket.close()
  socket.onmessage = (event) => {
    if (!isCurrent()) {
      console.debug('ws: ignored stale message', { connectionId })
      return
    }
    try {
      handleMessage(parseJSON(event.data))
    } catch {
      // Ignore invalid messages.
    }
  }
}

const websocketMessageDiagnostics = (message: object) =>
  'token' in message && typeof message.token === 'string'
    ? {
        ...message,
        token:
          'action' in message && message.action === 'authenticate'
            ? getIdTokenDiagnostics(message.token)
            : { present: true },
      }
    : message

const isAdminDataCollection = (value: unknown): value is AdminDataCollection =>
  value === 'emailTemplates' ||
  value === 'eventTypes' ||
  value === 'judges' ||
  value === 'locations' ||
  value === 'officials' ||
  value === 'organizers' ||
  value === 'users'

const eventTypeKey = (item: { eventType: string }) => item.eventType

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

const getViewerPayloads = (viewers: unknown[]): EventViewer[] =>
  viewers
    .map((viewer) => {
      if (typeof viewer === 'string') {
        return { name: viewer, userId: viewer }
      }

      if (!viewer || typeof viewer !== 'object') {
        return undefined
      }

      const { name, userId } = viewer as Partial<EventViewer>
      if (typeof userId !== 'string') {
        return undefined
      }

      return { name: typeof name === 'string' && name.trim() ? name : userId, userId }
    })
    .filter((viewer): viewer is EventViewer => !!viewer)

const mapEventViewers = (
  viewers: EventViewer[],
  adminUsers: Array<{ id: string; name?: string }>,
  currentUser?: { id: string; name?: string }
) => {
  const usersById = new Map(adminUsers.map((user) => [user.id, user] as const))
  if (currentUser?.id) {
    usersById.set(currentUser.id, currentUser)
  }

  return viewers.map((viewer) => ({
    name: viewer.name === viewer.userId ? (usersById.get(viewer.userId)?.name ?? viewer.name) : viewer.name,
    userId: viewer.userId,
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
  viewers: EventViewer[]
  subscribeAdmin: () => void
  subscribeEvent: (eventId: string) => void
  subscribeRegistration: (
    eventId: string,
    registrationId: string,
    editToken: string,
    listener: (patch: Patch<Registration>) => void
  ) => void
  unsubscribeEvent: () => void
  unsubscribeRegistration: () => void
  subscribeAuditRecords: (listener: (record: AuditRecord) => void) => () => void
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(null)

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useWebSocket = () => {
  const resolvedIdToken = useAtomValue(validIdTokenValueAtom)
  const adminUsers = useAtomValue(websocketAdminUsersValueAtom)
  const resolvedCurrentUser = useAtomValue(userValueAtom)
  const markRecentlyUpdated = useMarkRecentlyUpdated()
  const shouldReconnectRef = useRef(true)

  // Subscription state — persisted across reconnects
  const adminSubscribedRef = useRef(false)
  const eventIdRef = useRef<string | undefined>(undefined)
  const registrationSubscriptionRef = useRef<{
    editToken: string
    eventId: string
    listener: (patch: Patch<Registration>) => void
    registrationId: string
  }>()
  const rawViewersRef = useRef<EventViewer[]>([])
  const auditRecordListenersRef = useRef(new Set<(record: AuditRecord) => void>())
  const adminDataCursorsRef = useRef<Partial<Record<AdminDataCollection, number | null>>>({})

  // Mutable refs for values only needed inside callbacks
  const idTokenRef = useRef<string | undefined>(undefined)
  const adminUsersRef = useRef<Array<{ id: string; name?: string }>>([])
  const currentUserRef = useRef<{ id: string; name?: string } | undefined>(undefined)
  const authFailedTokenRef = useRef<string | undefined>(undefined)

  const currentUser = resolvedCurrentUser?.id ? resolvedCurrentUser : undefined
  const idToken = resolvedIdToken

  idTokenRef.current = idToken
  adminUsersRef.current = adminUsers
  currentUserRef.current = currentUser

  const setPublicEvents = useAtomCallback(
    useCallback(
      (get, set, eventId: string, patch: Patch<PublicDogEvent>, options?: { insert?: boolean }) => {
        const events = get(eventsAtom)

        if (patch.state === 'draft') {
          const next = events.filter((event) => event.id !== eventId)
          if (next.length === events.length) return

          markRecentlyUpdated('public:event', eventId)
          set(eventsAtom, next)
          return
        }

        const insert = options?.insert ?? true
        const next = insert ? applyPatchOrInsert(events, eventId, patch) : applyPatch(events, eventId, patch)
        if (next !== events) markRecentlyUpdated('public:event', eventId)
        set(eventsAtom, next)
      },
      [markRecentlyUpdated]
    )
  )
  const setAdminEvents = useAtomCallback(
    useCallback(
      async (get, set, eventId: string, patch: Patch<DogEvent>) => {
        const events = await get(adminEventsAtom)
        const next = applyPatchOrInsert(events, eventId, patch)
        if (next !== events) markRecentlyUpdated('admin:event', eventId)
        set(adminEventsAtom, next)
      },
      [markRecentlyUpdated]
    )
  )
  const patchRegistrations = useAtomCallback(
    useCallback(
      async (get, set, nextEventId: string, patch: Patch<Registration>[]) => {
        let registrations: Registration[]
        try {
          registrations = await get(adminEventRegistrationsAtom(nextEventId))
        } catch {
          return
        }

        const next = applyRegistrationPatches(registrations, patch)
        if (next !== registrations) {
          for (const registrationId of getRegistrationPatchChangedIds(registrations, patch)) {
            markRecentlyUpdated('admin:registration', registrationId)
          }
        }

        set(adminEventRegistrationsAtom(nextEventId), next)
      },
      [markRecentlyUpdated]
    )
  )
  const refreshAdminData = useAtomCallback(
    useCallback(async (get, set, collections: AdminDataCollection[], token: string) => {
      await Promise.all(
        collections.map(async (collection) => {
          switch (collection) {
            case 'users': {
              const current = await get(adminUsersAtom)
              const since = collectionSince(current, adminDataCursorsRef.current.users)
              const response = since ? await getUsers(token, undefined, since) : await getUsers(token)
              adminDataCursorsRef.current.users = collectionResponseCursor(response)
              set(adminUsersAtom, (latest) => reconcileCollection(latest, response))
              break
            }
            case 'organizers':
              set(adminOrganizersAtom, [...(await getAdminOrganizers(token))].sort(compareByLocalizedString('name')))
              break
            // Refreshed weekly and never edited, so there is nothing incremental to reconcile.
            case 'locations':
              set(adminLocationsAtom, [...(await getLocations(token))].sort(compareByLocalizedString('name')))
              break
            case 'judges': {
              const current = await get(adminJudgesAtom)
              const since = collectionSince(current, adminDataCursorsRef.current.judges)
              const response = since ? await getJudges(token, undefined, undefined, since) : await getJudges(token)
              adminDataCursorsRef.current.judges = collectionResponseCursor(response)
              set(adminJudgesAtom, (latest) =>
                reconcileCollection(latest, response).sort(compareByLocalizedString('name'))
              )
              break
            }
            case 'officials': {
              const current = await get(adminOfficialsAtom)
              const since = collectionSince(current, adminDataCursorsRef.current.officials)
              const response = since
                ? await getOfficials(token, undefined, undefined, since)
                : await getOfficials(token)
              adminDataCursorsRef.current.officials = collectionResponseCursor(response)
              set(adminOfficialsAtom, (latest) =>
                reconcileCollection(latest, response).sort(compareByLocalizedString('name'))
              )
              break
            }
            case 'eventTypes': {
              const current = await get(adminEventTypesAtom)
              const since = collectionSince(current, adminDataCursorsRef.current.eventTypes)
              const response = since
                ? await getEventTypes(token, undefined, undefined, since)
                : await getEventTypes(token)
              adminDataCursorsRef.current.eventTypes = collectionResponseCursor(response)
              set(adminEventTypesAtom, (latest) =>
                reconcileCollection(latest, response, eventTypeKey).sort(compareByLocalizedString('eventType'))
              )
              break
            }
            case 'emailTemplates': {
              const current = await get(adminEmailTemplatesAtom)
              const since = collectionSince(current, adminDataCursorsRef.current.emailTemplates)
              const response = since
                ? await getEmailTemplates(token, undefined, since)
                : await fetchEmailTemplates(token)
              adminDataCursorsRef.current.emailTemplates = collectionResponseCursor(response)
              set(adminEmailTemplatesAtom, (latest) =>
                reconcileCollection(latest, response).sort(compareByLocalizedString('id'))
              )
              break
            }
          }
        })
      )
    }, [])
  )

  const [viewers, setViewers] = useState<EventViewer[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const connectionSequenceRef = useRef(0)
  const previousTokenRef = useRef<string | undefined>(idTokenRef.current)
  const tokenEffectInitializedRef = useRef(false)

  const resolvedViewers = useMemo(
    () => mapEventViewers(rawViewersRef.current, adminUsers, currentUser),
    [adminUsers, currentUser]
  )

  const sendIfOpen = useCallback((msg: object, socket = wsRef.current) => {
    if (socket?.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(msg)
      console.debug('ws: send', websocketMessageDiagnostics(msg))
      socket.send(payload)
      return true
    }
    console.debug('ws: send skipped, socket not open', {
      message: websocketMessageDiagnostics(msg),
      readyState: socket?.readyState,
    })
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
      const registration = registrationSubscriptionRef.current
      if (registration) {
        sendIfOpen(
          {
            action: 'subscribe',
            channel: 'registration',
            eventId: registration.eventId,
            registrationId: registration.registrationId,
            token: registration.editToken,
          },
          socket
        )
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

  const subscribeRegistration = useCallback(
    (eventId: string, registrationId: string, editToken: string, listener: (patch: Patch<Registration>) => void) => {
      registrationSubscriptionRef.current = { editToken, eventId, listener, registrationId }
      sendIfOpen({ action: 'subscribe', channel: 'registration', eventId, registrationId, token: editToken })
    },
    [sendIfOpen]
  )

  const unsubscribeRegistration = useCallback(() => {
    if (!registrationSubscriptionRef.current) return
    sendIfOpen({ action: 'unsubscribe', channel: 'registration' })
    registrationSubscriptionRef.current = undefined
  }, [sendIfOpen])

  const subscribeAuditRecords = useCallback((listener: (record: AuditRecord) => void) => {
    auditRecordListenersRef.current.add(listener)
    return () => auditRecordListenersRef.current.delete(listener)
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

  const handleAdminMessage = useCallback(
    (data: any, token: string | undefined): boolean => {
      if (data.scope === 'admin:event-registrations' && data.eventId && Array.isArray(data.patch)) {
        patchRegistrations(data.eventId, data.patch)
        return true
      }
      if (data.scope === 'admin:audit-record' && data.record?.auditKey && data.record.timestamp instanceof Date) {
        for (const listener of auditRecordListenersRef.current) listener(data.record)
        return true
      }
      if (data.scope === 'admin:data-invalidation' && Array.isArray(data.collections) && token) {
        const collections = data.collections.filter(isAdminDataCollection)
        if (collections.length) void refreshAdminData(collections, token).catch(console.error)
        return true
      }
      if (data.scope !== 'admin:event-viewers' || !data.eventId || !Array.isArray(data.viewers)) return false

      const viewerPayloads = getViewerPayloads(data.viewers)
      rawViewersRef.current = viewerPayloads
      const nextViewers = mapEventViewers(viewerPayloads, adminUsersRef.current, currentUserRef.current)
      setViewers((current) => applyViewers(current, nextViewers))
      return true
    },
    [patchRegistrations, refreshAdminData]
  )

  const handleMessageData = useCallback(
    (data: any, token: string | undefined, ws: WebSocket, connectionId: number) => {
      console.debug('ws: ', data)

      if (handleAdminMessage(data, token)) return

      const registrationSubscription = registrationSubscriptionRef.current
      if (
        registrationSubscription &&
        data.scope === 'participant:registration-patch' &&
        data.patch &&
        typeof data.patch === 'object' &&
        data.eventId === registrationSubscription.eventId &&
        data.registrationId === registrationSubscription.registrationId
      ) {
        registrationSubscription.listener(data.patch)
        return
      }

      if (data.authenticated === true) {
        console.debug('ws: authentication succeeded', {
          connectionId,
          token: token ? getIdTokenDiagnostics(token) : undefined,
        })
        authFailedTokenRef.current = undefined
        resendActiveSubscriptions(ws)
        return
      }

      if (data.ok === false && (data.status === 401 || data.status === 403)) {
        console.warn('ws: authentication failed', {
          connectionId,
          status: data.status,
          token: token ? getIdTokenDiagnostics(token) : undefined,
        })
        if (token) authFailedTokenRef.current = token
        shouldReconnectRef.current = false
        ws.close()
        return
      }

      if (data.eventId) {
        handleEventPatchMessage(data)
      }
    },
    [handleAdminMessage, handleEventPatchMessage, resendActiveSubscriptions]
  )

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return

    const token = idTokenRef.current
    if (token && authFailedTokenRef.current === token) return

    const connectionId = ++connectionSequenceRef.current
    console.debug('ws: connecting', {
      connectionId,
      token: token ? getIdTokenDiagnostics(token) : undefined,
    })
    const ws = new WebSocket(WS_API_URL)
    wsRef.current = ws
    configureWebSocket({
      connectionId,
      handleMessage: (data) => handleMessageData(data, token, ws, connectionId),
      isCurrent: () => wsRef.current === ws,
      onOpen: () => {
        reconnectAttempts.current = 0
      },
      onReconnect: () => {
        const delay = Math.min(30000, RECONNECT_INTERVAL * 2 ** reconnectAttempts.current)
        console.debug('ws: reconnect scheduled', { connectionId, delay })
        reconnectAttempts.current++
        reconnectTimeoutRef.current = globalThis.setTimeout(connect, delay)
      },
      resendSubscriptions: resendActiveSubscriptions,
      send: sendIfOpen,
      shouldReconnect: () => shouldReconnectRef.current,
      socket: ws,
      token,
    })
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
    const previousToken = previousTokenRef.current
    const nextToken = idToken

    if (!tokenEffectInitializedRef.current) {
      tokenEffectInitializedRef.current = true
      previousTokenRef.current = nextToken
      return
    }

    if (previousToken === nextToken) return

    console.debug('ws: auth token changed', {
      next: nextToken ? getIdTokenDiagnostics(nextToken) : undefined,
      previous: previousToken ? getIdTokenDiagnostics(previousToken) : undefined,
    })

    previousTokenRef.current = nextToken
    adminDataCursorsRef.current = {
      emailTemplates: null,
      eventTypes: null,
      judges: null,
      officials: null,
      users: null,
    }
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
  }, [connect, idToken])

  return {
    subscribeAdmin,
    subscribeAuditRecords,
    subscribeEvent,
    subscribeRegistration,
    unsubscribeEvent,
    unsubscribeRegistration,
    viewers,
  }
}

export const useWebSocketContext = (): WebSocketContextValue => {
  const ctx = useContext(WebSocketContext)
  if (!ctx) throw new Error('useWebSocketContext must be used within WebSocketProvider')
  return ctx
}
