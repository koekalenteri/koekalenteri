import type { Getter } from 'jotai'
import type { DogEvent, User } from '@/types'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { getAdminEvents } from '@/api/event'
import { compareEventsByDate } from '@/lib/event'
import { latestCollectionUpdate } from '@/lib/incremental'
import { userAtom, userRefreshAtom, validIdTokenAtom } from '@/pages/state'
import { parseStorageJSON } from '@/pages/state/storage/atoms'

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

type LocalAdminEvents = { events: DogEvent[]; fetchKey: string }

/**
 * What the fetch depends on: it runs again when the token or the user changes. The key is read
 * instead of the fetch atom itself, so a local write never starts a fetch of its own.
 */
const fetchKeyAtom = atom((get) => `${get(userRefreshAtom)}:${get(validIdTokenAtom) ?? ''}`)
// Set once a fetch has run in this store, so a write of a whole list (a seeded store) can tell
// there is no fetched list to build on without reading the fetch, which would start one.
const fetchStartedAtom = atom(() => ({ current: false }))

// The list is returned with the key it was fetched for, so a settled fetch can be told apart from
// the previous one that unwrap holds while the next is pending.
const remoteAdminEventsAtom = atom(async (get): Promise<LocalAdminEvents> => {
  get(fetchStartedAtom).current = true
  const fetchKey = get(fetchKeyAtom)
  const token = get(validIdTokenAtom)
  const user = await get(userAtom)
  if (!token || !user) return { events: [], fetchKey }

  const scopeKey = 'adminEvents:scope'
  const stored = parseStorageJSON(sessionStorage.getItem('adminEvents'))
  const cached = sessionStorage.getItem(scopeKey) === cacheScope(user) && Array.isArray(stored) ? stored : undefined
  const since = cached ? latestCollectionUpdate(cached)?.getTime() : undefined
  const events = await getAdminEvents(token, since)

  sessionStorage.setItem(scopeKey, cacheScope(user))
  return { events: cached && since ? reconcileAdminEvents(cached, events) : sortEvents(events), fetchKey }
})

// The first load suspends on this one Promise, instead of a fresh `.then` on every read.
const remoteAdminEventListAtom = atom(async (get) => (await get(remoteAdminEventsAtom)).events)

/**
 * A list written locally (a save, a websocket patch), under the key of the list it was built on.
 * It is served only while that fetch is the current one: a new fetch, after a token refresh or a
 * new login, replaces the local list instead of staying hidden under it (KOE-1500). The events
 * written while the new fetch was pending are kept aside, because its response was requested
 * before them, and laid on top of it when it settles.
 */
type LocalAdminEventsWrite = LocalAdminEvents & { pending?: LocalAdminEvents }
const adminEventsOverrideAtom = atom<LocalAdminEventsWrite | undefined>(undefined)
// Once the fetch has settled, serve the list synchronously: a dependent reading it in a plain
// getter (adminEventAtom) then gets the array instead of chaining a fresh `.then` Promise for
// every new event id, which would suspend its subscribers on each selection. While the next fetch
// is pending it holds the last settled one.
const loadedAdminEventsAtom = unwrap(remoteAdminEventsAtom, (previous) => previous)

const isNewer = (event: DogEvent, than: DogEvent | undefined): boolean =>
  (than?.updatedAt?.valueOf() ?? Number.NEGATIVE_INFINITY) > (event.updatedAt?.valueOf() ?? Number.NEGATIVE_INFINITY)

// A written event stands unless the fetch carries a newer version of it.
const withPendingWrites = (loaded: LocalAdminEvents, local: LocalAdminEventsWrite | undefined): LocalAdminEvents => {
  if (local?.pending?.fetchKey !== loaded.fetchKey) return loaded
  const fetched = new Map(loaded.events.map((event) => [event.id, event]))
  const written = local.pending.events.filter((event) => !isNewer(event, fetched.get(event.id)))
  return { events: reconcileAdminEvents(loaded.events, written), fetchKey: loaded.fetchKey }
}

/**
 * The list to serve or to build a write on, with the key it belongs to. The current fetch's list
 * comes first, whether local or fetched. While the fetch is pending, the newer of the two stands
 * in: the local list if it was built on the last settled fetch, else that fetch, so a sign-out
 * does not leave the previous login's list showing.
 */
const currentAdminEvents = (get: Getter): LocalAdminEventsWrite | undefined => {
  const fetchKey = get(fetchKeyAtom)
  const local = get(adminEventsOverrideAtom)
  if (local?.fetchKey === fetchKey) return local
  let loaded: LocalAdminEvents | undefined
  try {
    loaded = get(loadedAdminEventsAtom)
  } catch (error) {
    // A failed refetch keeps the list in hand
    if (local) return local
    throw error
  }
  if (!loaded) return local
  if (loaded.fetchKey !== fetchKey && local?.fetchKey === loaded.fetchKey) return local
  return withPendingWrites(loaded, local)
}

const writeAdminEvents = (get: Getter, base: LocalAdminEventsWrite | undefined, events: DogEvent[]) => {
  const fetchKey = get(fetchKeyAtom)
  if (!base || base.fetchKey === fetchKey) return { events, fetchKey }

  const before = new Map(base.events.map((event) => [event.id, event]))
  const changed = events.filter((event) => before.get(event.id) !== event)
  const earlier = base.pending?.fetchKey === fetchKey ? base.pending.events : []
  return { events, fetchKey: base.fetchKey, pending: { events: reconcileAdminEvents(earlier, changed), fetchKey } }
}

export const adminEventsRemoteAtom = atom(
  (get) => currentAdminEvents(get)?.events ?? get(remoteAdminEventListAtom),
  (get, set, value: DogEvent[] | ((previous: DogEvent[]) => DogEvent[])) => {
    const isUpdate = typeof value === 'function'
    const base = isUpdate || get(fetchStartedAtom).current ? currentAdminEvents(get) : get(adminEventsOverrideAtom)
    if (isUpdate && !base) throw new Error('Cannot update admin events before they have loaded')
    const events = isUpdate ? value(base?.events ?? []) : value
    set(adminEventsOverrideAtom, writeAdminEvents(get, base, events))
  }
)
