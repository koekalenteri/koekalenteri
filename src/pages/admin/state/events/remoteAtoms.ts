import type { Getter } from 'jotai'
import type { DogEvent, User } from '@/types'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { getAdminEvents } from '@/api/event'
import { compareEventsByDate } from '@/lib/event'
import { keepNewerRows, latestCollectionUpdate } from '@/lib/incremental'
import { trackSettled } from '@/lib/maybePromise'
import { getJwtSubject } from '@/lib/token'
import { toDogEvent } from '@/lib/wire'
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

/**
 * A list with the fetch it belongs to: the key changes with the token or the user, and the
 * subject tells a refreshed token of the same person apart from a new login.
 */
type AdminEventList = { events: DogEvent[]; fetchKey: string; subject?: string }

/**
 * What the fetch depends on. It is read instead of the fetch atom itself, so a whole-list write
 * never starts a fetch of its own.
 */
const fetchKeyAtom = atom((get) => `${get(userRefreshAtom)}:${get(validIdTokenAtom) ?? ''}`)
const subjectAtom = atom((get) => {
  const token = get(validIdTokenAtom)
  return token ? getJwtSubject(token) : undefined
})

const CACHE_KEY = 'adminEvents'
const SCOPE_KEY = 'adminEvents:scope'

/**
 * The fetched list, kept for the next fetch of the same session to ask only for what changed since
 * its newest stamp (KOE-1668). A local write is not kept: the server stamps every event write, so
 * the next fetch brings it back anyway.
 */
const storeAdminEvents = (events: DogEvent[], scope: string) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(events))
    sessionStorage.setItem(SCOPE_KEY, scope)
  } catch {
    // A full storage keeps the list stored before, which is consistent with its scope: the next
    // fetch asks for the changes since that one, or for the whole list after a change of roles.
  }
}

/**
 * The list as the server has it: what the last fetch stored, with what has changed since its newest
 * stamp. The stored list, not the one in hand, gives that stamp: a save made while the socket was away
 * is stamped past the changes the socket missed.
 */
const readAdminEvents = async (token: string, user: User) => {
  const scope = cacheScope(user)
  const stored: unknown = parseStorageJSON(sessionStorage.getItem(CACHE_KEY))
  const cached =
    sessionStorage.getItem(SCOPE_KEY) === scope && Array.isArray(stored) ? stored.map(toDogEvent) : undefined
  const since = cached ? latestCollectionUpdate(cached)?.getTime() : undefined
  const fetched = await getAdminEvents(token, since)
  const events = cached && since ? reconcileAdminEvents(cached, fetched) : sortEvents(fetched)
  return { events, scope }
}

const remoteAdminEventsAtom = atom(async (get, { signal }): Promise<AdminEventList> => {
  const fetchKey = get(fetchKeyAtom)
  const subject = get(subjectAtom)
  const token = get(validIdTokenAtom)
  const user = await get(userAtom)
  if (!token || !user) return { events: [], fetchKey }

  const { events, scope } = await readAdminEvents(token, user)

  // A fetch that settles after the token changed, a sign-out among them, must not store the list
  // again into the storage the sign-out cleared.
  if (!signal.aborted) storeAdminEvents(events, scope)
  return { events, fetchKey, subject }
})

// The first load suspends on this one Promise, instead of a fresh `.then` on every read.
const remoteAdminEventListAtom = atom(async (get) => (await get(remoteAdminEventsAtom)).events)

/**
 * A list written locally (a save, a websocket patch), under the key of the fetch it was built on.
 * A new fetch, after a token refresh or a new login, replaces it instead of staying hidden under it
 * (KOE-1500).
 */
const adminEventsOverrideAtom = atom<AdminEventList | undefined>(undefined)
// Once the fetch has settled, serve the list synchronously: a dependent reading it in a plain
// getter (adminEventAtom) then gets the array instead of chaining a fresh `.then` Promise for
// every new event id, which would suspend its subscribers on each selection. While the next fetch
// is pending it holds the last settled one.
const loadedAdminEventsAtom = unwrap(remoteAdminEventsAtom, (previous) => previous)

/**
 * The fetches a page waited for with nothing to stand in. Such a fetch stays the value after it
 * settles, until a write or a later fetch replaces the list: a component that suspended on it at
 * mount reads the same Promise when it finishes, which React requires (it warns when a mount that
 * suspended on `use()` finishes a render without one). A reader that comes along later gets the
 * settled list synchronously through `mapMaybe` (loadedAtom does the same for the other remotes).
 */
const firstLoads = new WeakSet<Promise<DogEvent[]>>()

// The newest list in hand: the local one if it was built on the last settled fetch, else that fetch.
// unwrap holds a settled fetch only if it was read after it settled, which a local list prevents.
const latestAdminEvents = (get: Getter): AdminEventList | undefined => {
  const local = get(adminEventsOverrideAtom)
  if (local?.fetchKey === get(fetchKeyAtom)) return local
  const loaded = get(loadedAdminEventsAtom)
  return local && (!loaded || local.fetchKey === loaded.fetchKey) ? local : loaded
}

/**
 * A whole list replaces the list of the current fetch, as a seeded store does. An update builds on
 * the current fetch's list and waits for it if it is pending, so nothing written meanwhile has to be
 * laid on top of a response that was requested before it.
 */
export const adminEventsRemoteAtom = atom(
  (get) => {
    const latest = latestAdminEvents(get)
    const current = latest?.fetchKey === get(fetchKeyAtom)
    // While the next fetch is pending, the same person's last list stands in. Another login waits.
    const sameSubject = latest?.subject !== undefined && latest.subject === get(subjectAtom)
    if (!latest || !(current || sameSubject)) {
      const remote = trackSettled(get(remoteAdminEventListAtom))
      firstLoads.add(remote)
      return remote
    }
    // The fetch is read only where the list came from it: a seeded list must not start one.
    if (current && !get(adminEventsOverrideAtom)) {
      const remote = get(remoteAdminEventListAtom)
      if (firstLoads.has(remote)) return remote
    }
    return latest.events
  },
  async (get, set, value: DogEvent[] | ((previous: DogEvent[]) => DogEvent[])) => {
    if (typeof value !== 'function') {
      set(adminEventsOverrideAtom, { events: value, fetchKey: get(fetchKeyAtom), subject: get(subjectAtom) })
      return
    }
    const current = () => {
      const local = get(adminEventsOverrideAtom)
      return local?.fetchKey === get(fetchKeyAtom) ? local : undefined
    }
    let base = current()
    while (!base) {
      const fetched = await get(remoteAdminEventsAtom)
      base = current() ?? (fetched.fetchKey === get(fetchKeyAtom) ? fetched : undefined)
    }
    set(adminEventsOverrideAtom, { ...base, events: value(base.events) })
  }
)

/**
 * Reads what changed while the socket was away, without touching the fetch key: a fetch that fails
 * under a new key throws into every reader, and at a reconnect the network is at its shakiest. A failed
 * read rejects here and leaves the list as it is. An answer is dropped if the key moved meanwhile: that
 * fetch read later.
 */
export const adminEventsRereadAtom = atom(null, async (get, set) => {
  // Waited for first, so this read is not answered by a fetch that started before the subscription.
  await get(remoteAdminEventsAtom)
  const fetchKey = get(fetchKeyAtom)
  const token = get(validIdTokenAtom)
  const user = await get(userAtom)
  if (!token || !user) return

  const { events, scope } = await readAdminEvents(token, user)
  if (get(fetchKeyAtom) !== fetchKey) return

  storeAdminEvents(events, scope)
  await set(adminEventsRemoteAtom, (current) => sortEvents(keepNewerRows(current, events)))
})
