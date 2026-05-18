import type { DeepPartial, DogEvent, PublicDogEvent, Registration } from '../types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRecoilCallback, useRecoilValueLoadable } from 'recoil'
import { patchMerge } from '../lib/utils'
import { adminEventsAtom } from '../pages/admin/recoil/events'
import { adminEventRegistrationsAtom } from '../pages/admin/recoil/registrations/atoms'
import { adminUsersAtom } from '../pages/admin/recoil/user/atoms'
import { idTokenAtom } from '../pages/recoil'
import { eventsAtom } from '../pages/recoil/events/atoms'
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

export interface EventViewer {
  userId: string
  name: string
}

const mapEventViewers = (
  viewers: Array<{ userId?: string }>,
  adminUsers: Array<{ id: string; name?: string }>,
  currentUser?: { id: string; name?: string }
) => {
  const usersById = new Map(adminUsers.map((user) => [user.id, user] as const))
  if (currentUser?.id) {
    usersById.set(currentUser.id, currentUser)
  }

  return viewers
    .map((viewer) => {
      if (!viewer.userId) return undefined

      return {
        name: usersById.get(viewer.userId)?.name ?? viewer.userId,
        userId: viewer.userId,
      }
    })
    .filter((viewer): viewer is EventViewer => !!viewer)
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

export const useWebSocket = (admin: boolean = false, eventId?: string) => {
  const idTokenLoadable = useRecoilValueLoadable(idTokenAtom)
  const adminUsersLoadable = useRecoilValueLoadable(adminUsersAtom)
  const currentUserLoadable = useRecoilValueLoadable(userSelector)
  const eventIdRef = useRef<string | undefined>(eventId)
  const rawViewersRef = useRef<Array<{ userId?: string }>>([])
  const shouldReconnectRef = useRef(true)
  const setPublicEvents = useRecoilCallback(
    ({ snapshot, set }) =>
      (eventId: string, patch: Partial<PublicDogEvent>) => {
        const loadable = snapshot.getLoadable(eventsAtom)
        if (loadable.state !== 'hasValue') return

        set(eventsAtom, (current) => applyPatch(current, eventId, patch))
      },
    []
  )
  const setAdminEvents = useRecoilCallback(
    ({ snapshot, set }) =>
      (eventId: string, patch: Partial<DogEvent>) => {
        const loadable = snapshot.getLoadable(adminEventsAtom)
        if (loadable.state !== 'hasValue') return

        set(adminEventsAtom, (current) => applyPatch(current, eventId, patch))
      },
    []
  )
  const setRegistrations = useRecoilCallback(
    ({ snapshot, set }) =>
      (nextEventId: string, registrations: Registration[]) => {
        const loadable = snapshot.getLoadable(adminEventRegistrationsAtom(nextEventId))
        if (loadable.state !== 'hasValue') return

        set(adminEventRegistrationsAtom(nextEventId), (current) => applyRegistrations(current, registrations))
      },
    []
  )
  const patchRegistrations = useRecoilCallback(
    ({ snapshot, set }) =>
      (nextEventId: string, patch: DeepPartial<Registration>[]) => {
        const loadable = snapshot.getLoadable(adminEventRegistrationsAtom(nextEventId))
        if (loadable.state !== 'hasValue') return

        set(adminEventRegistrationsAtom(nextEventId), (current) => applyRegistrationPatches(current, patch))
      },
    []
  )
  const [viewers, setViewers] = useState<EventViewer[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const adminUsers = adminUsersLoadable.state === 'hasValue' ? adminUsersLoadable.contents : []
  const currentUser =
    currentUserLoadable.state === 'hasValue' && currentUserLoadable.contents?.id
      ? currentUserLoadable.contents
      : undefined
  const resolvedViewers = useMemo(
    () => mapEventViewers(rawViewersRef.current, adminUsers, currentUser),
    [adminUsers, currentUser]
  )

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return

    const token = idTokenLoadable.state === 'hasValue' ? idTokenLoadable.contents : undefined
    const url = token ? `${WS_API_URL}?token=${encodeURIComponent(token)}` : WS_API_URL
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttempts.current = 0

      if (admin && eventIdRef.current) {
        ws.send(JSON.stringify({ action: 'subscribe', eventId: eventIdRef.current }))
      }
    }

    ws.onclose = () => {
      if (!shouldReconnectRef.current) return

      // Try to reconnect with exponential backoff
      const delay = Math.min(30000, RECONNECT_INTERVAL * 2 ** reconnectAttempts.current)
      reconnectAttempts.current++
      reconnectTimeoutRef.current = globalThis.setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.debug('ws: ', data)

        if (data.scope === 'admin:event-registrations' && data.eventId && Array.isArray(data.patch)) {
          patchRegistrations(data.eventId, data.patch)
          return
        }

        if (data.scope === 'admin:event-viewers' && data.eventId && Array.isArray(data.viewers)) {
          rawViewersRef.current = data.viewers
          const nextViewers = mapEventViewers(data.viewers, adminUsers, currentUser)
          setViewers((current) => applyViewers(current, nextViewers))
          return
        }

        if (data.eventId) {
          const { eventId, ...patch } = data
          if (admin) {
            setAdminEvents(eventId, patch)
          } else {
            setPublicEvents(eventId, patch)
          }
        }
      } catch {
        // ignore invalid messages
      }
    }
  }, [admin, adminUsers, currentUser, idTokenLoadable, patchRegistrations, setAdminEvents, setPublicEvents])

  useEffect(() => {
    setViewers((current) => applyViewers(current, resolvedViewers))
  }, [resolvedViewers])

  useEffect(() => {
    const previousEventId = eventIdRef.current
    eventIdRef.current = eventId

    if (admin && previousEventId !== eventId) {
      rawViewersRef.current = []
      setViewers([])
    }

    if (!admin || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    wsRef.current.send(JSON.stringify(eventId ? { action: 'subscribe', eventId } : { action: 'unsubscribe' }))
  }, [admin, eventId])

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

  return { viewers }
}
