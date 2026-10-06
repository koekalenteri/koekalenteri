import type { DogEvent, User } from '@/types'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { getAdminEvents } from '@/api/event'
import { compareEventsByDate } from '@/lib/event'
import { latestCollectionUpdate } from '@/lib/incremental'
import { userAtom, validIdTokenAtom } from '@/pages/state'
import { parseStorageJSON } from '@/pages/state/storage/atoms'
import { userRefreshAtom } from '@/pages/state/user/atoms'

// The same order as the public calendar, so a save (adminEventAtom) and a fetch agree on it.
const sortEvents = (events: DogEvent[]): DogEvent[] => [...events].sort(compareEventsByDate)

const cacheScope = (user: User): string =>
  JSON.stringify({
    admin: Boolean(user.admin),
    id: user.id,
    roles: Object.entries(user.roles ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  })

export const reconcileAdminEvents = (existing: DogEvent[], changed: DogEvent[]): DogEvent[] => {
  const byId = new Map(existing.map((event) => [event.id, event]))
  for (const event of changed) byId.set(event.id, event)
  return sortEvents([...byId.values()])
}

const remoteAdminEventsAtom = atom(async (get) => {
  const token = get(validIdTokenAtom)
  const user = await get(userAtom)
  if (!token || !user) return []

  const scopeKey = 'adminEvents:scope'
  const stored = parseStorageJSON(sessionStorage.getItem('adminEvents'))
  const cached = sessionStorage.getItem(scopeKey) === cacheScope(user) && Array.isArray(stored) ? stored : undefined
  const since = cached ? latestCollectionUpdate(cached)?.getTime() : undefined
  const events = await getAdminEvents(token, since)

  sessionStorage.setItem(scopeKey, cacheScope(user))
  return cached && since ? reconcileAdminEvents(cached, events) : sortEvents(events)
})
type LocalAdminEvents = { events: DogEvent[]; fetchKey: string }

/**
 * What the fetch depends on: it runs again when the token or the user changes. The key is read
 * instead of the fetch atom itself, so a local write never starts a fetch of its own.
 */
const fetchKeyAtom = atom((get) => `${get(userRefreshAtom)}:${get(validIdTokenAtom) ?? ''}`)

/**
 * A list written locally (a save, a websocket patch), layered on the fetch it was made during. It
 * is served only while that fetch is the current one: a new fetch, after a token refresh or a new
 * login, replaces the local list instead of staying hidden under it (KOE-1500).
 */
const adminEventsOverrideAtom = atom<LocalAdminEvents | undefined>(undefined)
const localAdminEvents = (local: LocalAdminEvents | undefined, fetchKey: string) =>
  local?.fetchKey === fetchKey ? local.events : undefined
// Once the fetch has settled, serve the list synchronously: a dependent reading it in a plain
// getter (adminEventAtom) then gets the array instead of chaining a fresh `.then` Promise for
// every new event id, which would suspend its subscribers on each selection.
const loadedAdminEventsAtom = unwrap(remoteAdminEventsAtom)

export const adminEventsRemoteAtom = atom(
  (get) =>
    localAdminEvents(get(adminEventsOverrideAtom), get(fetchKeyAtom)) ??
    get(loadedAdminEventsAtom) ??
    get(remoteAdminEventsAtom),
  (get, set, value: DogEvent[] | ((previous: DogEvent[]) => DogEvent[])) => {
    const fetchKey = get(fetchKeyAtom)
    set(adminEventsOverrideAtom, (current) => {
      if (typeof value !== 'function') return { events: value, fetchKey }
      const previous = localAdminEvents(current, fetchKey) ?? get(loadedAdminEventsAtom)
      if (!previous) throw new Error('Cannot update admin events before they have loaded')
      return { events: value(previous), fetchKey }
    })
  }
)
