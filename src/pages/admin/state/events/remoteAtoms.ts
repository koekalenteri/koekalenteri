import type { Getter } from 'jotai'
import type { DogEvent, User } from '@/types'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { getAdminEvents } from '@/api/event'
import { compareEventsByDate } from '@/lib/event'
import { latestCollectionUpdate } from '@/lib/incremental'
import { getJwtSubject } from '@/lib/token'
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

const remoteAdminEventsAtom = atom(async (get): Promise<AdminEventList> => {
  const fetchKey = get(fetchKeyAtom)
  const subject = get(subjectAtom)
  const token = get(validIdTokenAtom)
  const user = await get(userAtom)
  if (!token || !user) return { events: [], fetchKey }

  const scopeKey = 'adminEvents:scope'
  const stored = parseStorageJSON(sessionStorage.getItem('adminEvents'))
  const cached = sessionStorage.getItem(scopeKey) === cacheScope(user) && Array.isArray(stored) ? stored : undefined
  const since = cached ? latestCollectionUpdate(cached)?.getTime() : undefined
  const events = await getAdminEvents(token, since)

  sessionStorage.setItem(scopeKey, cacheScope(user))
  return { events: cached && since ? reconcileAdminEvents(cached, events) : sortEvents(events), fetchKey, subject }
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
    if (latest?.fetchKey === get(fetchKeyAtom)) return latest.events
    // While the next fetch is pending, the same person's last list stands in. Another login waits.
    if (latest?.subject && latest.subject === get(subjectAtom)) return latest.events
    return get(remoteAdminEventListAtom)
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
