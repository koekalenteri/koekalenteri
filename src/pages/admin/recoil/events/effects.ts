import type { AtomEffect } from 'recoil'
import type { DogEvent, User } from '../../../../types'
import { DefaultValue } from 'recoil'
import { getAdminEvents } from '../../../../api/event'
import { latestCollectionUpdate } from '../../../../lib/incremental'
import { userSelector, validIdTokenSelector } from '../../../recoil'
import { parseStorageJSON } from '../../../recoil/effects/storage'

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

export const adminRemoteEventsEffect: AtomEffect<DogEvent[]> = ({ getPromise, node, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      Promise.all([getPromise(validIdTokenSelector), getPromise(userSelector)]).then(async ([token, user]) => {
        if (!token || !user) return new DefaultValue()

        const scopeKey = `${node.key}:scope`
        const stored = parseStorageJSON(sessionStorage.getItem(node.key))
        const cached =
          sessionStorage.getItem(scopeKey) === cacheScope(user) && Array.isArray(stored) ? stored : undefined
        const since = cached ? latestCollectionUpdate(cached)?.getTime() : undefined
        const events = await getAdminEvents(token, since)

        sessionStorage.setItem(scopeKey, cacheScope(user))
        return cached && since ? reconcileAdminEvents(cached, events) : sortEvents(events)
      })
    )
  }
}
