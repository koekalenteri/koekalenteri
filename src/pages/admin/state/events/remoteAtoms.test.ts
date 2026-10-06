import type { DogEvent } from '@/types'
import { createStore } from 'jotai'
import { getAdminEvents } from '@/api/event'
import { idTokenAtom } from '@/pages/state'
import { makeTestIdToken } from '@/test-utils/utils'
import { adminEventsRemoteAtom, reconcileAdminEvents } from './remoteAtoms'

vi.mock('@/api/event', () => ({
  getAdminEvents: vi.fn(),
}))
vi.mock('@/api/user')

const event = (id: string, startDate: string, updatedAt: string): DogEvent =>
  ({ id, startDate: new Date(startDate), updatedAt: new Date(updatedAt) }) as DogEvent

describe('reconcileAdminEvents', () => {
  it('merges changed and new events into the cached collection', () => {
    const unchanged = event('unchanged', '2026-02-01', '2026-01-01')
    const stale = event('changed', '2026-03-01', '2026-01-01')
    const changed = event('changed', '2026-04-01', '2026-01-02')
    const added = event('added', '2026-01-01', '2026-01-02')

    expect(reconcileAdminEvents([unchanged, stale], [changed, added])).toEqual([added, unchanged, changed])
  })
})

describe('adminEventsRemoteAtom', () => {
  // A refresh hands the same person a new token, a new login may be someone else
  const TOKEN = makeTestIdToken({ iat: 1, sub: 'secretary-a' })
  const REFRESHED_TOKEN = makeTestIdToken({ iat: 2, sub: 'secretary-a' })
  const OTHER_TOKEN = makeTestIdToken({ iat: 3, sub: 'secretary-b' })

  const first = event('first', '2026-02-01', '2026-01-01')
  const second = event('second', '2026-03-01', '2026-01-01')
  const third = event('third', '2026-04-01', '2026-01-02')
  const fourth = event('fourth', '2026-05-01', '2026-01-03')

  beforeEach(() => {
    vi.mocked(getAdminEvents).mockReset()
  })

  const pendingFetch = () => {
    let resolve: (events: DogEvent[]) => void = () => undefined
    let reject: (error: Error) => void = () => undefined
    const promise = new Promise<DogEvent[]>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, reject, resolve }
  }

  // The first fetch has settled, a save has written the list locally and a component is mounted
  const loadedStore = async () => {
    vi.mocked(getAdminEvents).mockResolvedValueOnce([first])
    const store = createStore()
    store.set(idTokenAtom, TOKEN)
    await expect(store.get(adminEventsRemoteAtom)).resolves.toEqual([first])
    await store.set(adminEventsRemoteAtom, (events) => [...events, second])
    store.sub(adminEventsRemoteAtom, () => undefined)
    return store
  }

  it('layers a local write on the fetched list', async () => {
    const store = await loadedStore()

    expect(store.get(adminEventsRemoteAtom)).toEqual([first, second])
    expect(getAdminEvents).toHaveBeenCalledTimes(1)
  })

  it('serves the next fetch instead of the local list once the token has changed (KOE-1500)', async () => {
    vi.mocked(getAdminEvents).mockResolvedValueOnce([]).mockResolvedValueOnce([first, second, third])
    const store = createStore()
    store.set(idTokenAtom, TOKEN)
    await expect(store.get(adminEventsRemoteAtom)).resolves.toEqual([])
    // A websocket patch arrives into the empty list, and the list is now a local one
    await store.set(adminEventsRemoteAtom, (events) => [...events, second])
    expect(store.get(adminEventsRemoteAtom)).toEqual([second])

    // Sign out, then sign in again
    store.set(idTokenAtom, undefined)
    await vi.waitFor(() => expect(store.get(adminEventsRemoteAtom)).toEqual([]))
    store.set(idTokenAtom, REFRESHED_TOKEN)

    await vi.waitFor(() => expect(store.get(adminEventsRemoteAtom)).toEqual([first, second, third]))
    expect(getAdminEvents).toHaveBeenCalledTimes(2)
  })

  it('lets a local write after the new fetch build on the new list', async () => {
    const store = await loadedStore()
    vi.mocked(getAdminEvents).mockResolvedValueOnce([first, third])

    store.set(idTokenAtom, REFRESHED_TOKEN)
    await vi.waitFor(() => expect(store.get(adminEventsRemoteAtom)).toEqual([first, third]))
    await store.set(adminEventsRemoteAtom, (events) => [...events, fourth])

    expect(store.get(adminEventsRemoteAtom)).toEqual([first, third, fourth])
  })

  describe('while a refreshed token’s fetch is pending', () => {
    const startRefresh = async () => {
      const store = await loadedStore()
      const next = pendingFetch()
      vi.mocked(getAdminEvents).mockReturnValueOnce(next.promise)
      store.set(idTokenAtom, REFRESHED_TOKEN)
      await vi.waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(2))
      return { next, store }
    }

    it('keeps showing the local list instead of suspending', async () => {
      const { store } = await startRefresh()

      expect(store.get(adminEventsRemoteAtom)).toEqual([first, second])
    })

    it('lays an update on the fetched list once it settles', async () => {
      const { next, store } = await startRefresh()

      const written = store.set(adminEventsRemoteAtom, (events) => [...events, third])
      next.resolve([first, second, fourth])
      await written

      expect(store.get(adminEventsRemoteAtom)).toEqual([first, second, fourth, third])
    })

    it('keeps an event an update removed out of the fetched list', async () => {
      const { next, store } = await startRefresh()

      const written = store.set(adminEventsRemoteAtom, (events) => events.filter((item) => item.id !== 'second'))
      next.resolve([first, second, fourth])
      await written

      expect(store.get(adminEventsRemoteAtom)).toEqual([first, fourth])
    })

    it('reports a failed fetch instead of the list fetched with the previous token', async () => {
      const { next, store } = await startRefresh()

      next.reject(new Error('network'))

      await vi.waitFor(() => expect(() => store.get(adminEventsRemoteAtom)).toThrow('network'))
    })
  })

  it('waits for another person’s fetch instead of serving the previous login’s list', async () => {
    const store = await loadedStore()
    vi.mocked(getAdminEvents).mockReturnValueOnce(pendingFetch().promise)

    store.set(idTokenAtom, OTHER_TOKEN)
    await vi.waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(2))

    expect(store.get(adminEventsRemoteAtom)).toBeInstanceOf(Promise)
  })

  it('waits for the next fetch instead of serving the empty list of a signed-out session', async () => {
    const store = await loadedStore()
    vi.mocked(getAdminEvents).mockReturnValueOnce(pendingFetch().promise)

    // An expired token in a hidden tab reads as signed out until the session is refreshed
    store.set(idTokenAtom, undefined)
    await vi.waitFor(() => expect(store.get(adminEventsRemoteAtom)).toEqual([]))
    store.set(idTokenAtom, REFRESHED_TOKEN)
    await vi.waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(2))

    expect(store.get(adminEventsRemoteAtom)).toBeInstanceOf(Promise)
  })
})
