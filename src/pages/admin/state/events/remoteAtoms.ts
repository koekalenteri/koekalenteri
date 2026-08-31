import type { DogEvent, User } from '../../../../types'
import { atom } from 'jotai'
import { getAdminEvents } from '../../../../api/event'
import { latestCollectionUpdate } from '../../../../lib/incremental'
import { userAtom, validIdTokenAtom } from '../../../state'
import { parseStorageJSON } from '../../../state/storage/atoms'

const byStartDate = (a: DogEvent, b: DogEvent) => a.startDate.valueOf() - b.startDate.valueOf()
const sortEvents = (events: DogEvent[]): DogEvent[] => [...events].sort(byStartDate)

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
const adminEventsOverrideAtom = atom<DogEvent[] | undefined>(undefined)
export const adminEventsRemoteAtom = atom(
  (get) => get(adminEventsOverrideAtom) ?? get(remoteAdminEventsAtom),
  (_get, set, value: DogEvent[] | ((previous: DogEvent[]) => DogEvent[])) =>
    set(adminEventsOverrideAtom, (current) => {
      if (typeof value !== 'function') return value
      if (!current) throw new Error('Cannot update admin events before they have loaded')
      return value(current)
    })
)
