import type { DayKey, DogEvent } from '@/types'
import { createStore } from 'jotai'
import { eventWithStaticDatesAnd3Classes } from '@/__mockData__/events'
import { getAdminEvents } from '@/api/event'
import { idTokenAtom } from '@/pages/state'
import { makeTestIdToken } from '@/test-utils/utils'
import { adminEventsRemoteAtom, adminEventsRereadAtom, reconcileAdminEvents } from './remoteAtoms'

vi.mock('@/api/event', () => ({
  getAdminEvents: vi.fn(),
}))
vi.mock('@/api/user')

const event = (id: string, startDate: DayKey, updatedAt: string): DogEvent =>
  ({ id, startDate, updatedAt: new Date(updatedAt) }) as DogEvent

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

  afterEach(() => sessionStorage.clear())

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
    expect(await store.get(adminEventsRemoteAtom)).toEqual([first])
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
    expect(await store.get(adminEventsRemoteAtom)).toEqual([])
    // A websocket patch arrives into the empty list, and the list is now a local one
    await store.set(adminEventsRemoteAtom, (events) => [...events, second])
    expect(store.get(adminEventsRemoteAtom)).toEqual([second])

    // Sign out, then sign in again
    store.set(idTokenAtom, undefined)
    await vi.waitFor(async () => expect(await store.get(adminEventsRemoteAtom)).toEqual([]))
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

  describe('the session cache (KOE-1668)', () => {
    const NEWEST = Date.parse('2026-01-02T00:00:00.000Z')

    it('asks only for the changes since the newest cached update after a token refresh', async () => {
      vi.mocked(getAdminEvents).mockResolvedValueOnce([first, third]).mockResolvedValueOnce([fourth])
      const store = createStore()
      store.set(idTokenAtom, TOKEN)
      expect(await store.get(adminEventsRemoteAtom)).toEqual([first, third])

      store.set(idTokenAtom, REFRESHED_TOKEN)

      const events = await store.get(adminEventsRemoteAtom)
      expect(getAdminEvents).toHaveBeenLastCalledWith(REFRESHED_TOKEN, NEWEST)
      expect(events).toEqual([first, third, fourth])
    })

    it('asks only for the changes after a reload of the page', async () => {
      vi.mocked(getAdminEvents).mockResolvedValueOnce([first, third]).mockResolvedValueOnce([])
      const before = createStore()
      before.set(idTokenAtom, TOKEN)
      await before.get(adminEventsRemoteAtom)

      const after = createStore()
      after.set(idTokenAtom, TOKEN)

      const events = await after.get(adminEventsRemoteAtom)
      expect(getAdminEvents).toHaveBeenLastCalledWith(TOKEN, NEWEST)
      expect(events).toEqual([first, third])
    })

    it('reads back from the cache the event it was given', async () => {
      const stored: DogEvent = { ...eventWithStaticDatesAnd3Classes, updatedAt: new Date('2026-01-02T00:00:00.000Z') }
      vi.mocked(getAdminEvents).mockResolvedValueOnce([stored]).mockResolvedValueOnce([])
      const before = createStore()
      before.set(idTokenAtom, TOKEN)
      await before.get(adminEventsRemoteAtom)

      const after = createStore()
      after.set(idTokenAtom, TOKEN)

      expect(await after.get(adminEventsRemoteAtom)).toEqual([stored])
    })

    it('fetches the whole list again for a user whose roles have changed', async () => {
      sessionStorage.setItem('adminEvents', JSON.stringify([third]))
      sessionStorage.setItem(
        'adminEvents:scope',
        JSON.stringify({ admin: false, id: 'asdf1234', roles: [['org', 'admin']] })
      )
      vi.mocked(getAdminEvents).mockResolvedValueOnce([first])
      const store = createStore()
      store.set(idTokenAtom, TOKEN)

      expect(await store.get(adminEventsRemoteAtom)).toEqual([first])
      expect(getAdminEvents).toHaveBeenCalledWith(TOKEN, undefined)
    })

    it('serves the fetched list when the storage is full', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })
      vi.mocked(getAdminEvents).mockResolvedValueOnce([first, third])
      const store = createStore()
      store.set(idTokenAtom, TOKEN)

      const events = await store.get(adminEventsRemoteAtom)
      setItem.mockRestore()

      expect(events).toEqual([first, third])
    })

    it('stores nothing from a fetch that settles after a sign-out', async () => {
      const pending = pendingFetch()
      vi.mocked(getAdminEvents).mockReturnValueOnce(pending.promise)
      const store = createStore()
      store.set(idTokenAtom, TOKEN)
      store.sub(adminEventsRemoteAtom, () => undefined)
      await vi.waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(1))

      store.set(idTokenAtom, undefined)
      sessionStorage.clear()
      pending.resolve([first])
      await vi.waitFor(async () => expect(await store.get(adminEventsRemoteAtom)).toEqual([]))

      expect(sessionStorage.getItem('adminEvents')).toBeNull()
    })
  })

  describe('reading again after the socket was away (KOE-1698)', () => {
    const NEWEST = Date.parse('2026-01-01T00:00:00.000Z')

    it('asks since what the last fetch stored, not a newer stamp a local save put on the list', async () => {
      const store = await loadedStore()
      const saved = event('saved', '2026-06-01', '2026-01-09')
      await store.set(adminEventsRemoteAtom, (events) => [...events, saved])
      vi.mocked(getAdminEvents).mockResolvedValueOnce([third])

      await store.set(adminEventsRereadAtom)

      expect(getAdminEvents).toHaveBeenLastCalledWith(TOKEN, NEWEST)
    })

    it('brings the changes in and stores them, so the next read asks since them', async () => {
      const store = await loadedStore()
      vi.mocked(getAdminEvents).mockResolvedValueOnce([third])

      await store.set(adminEventsRereadAtom)

      expect(store.get(adminEventsRemoteAtom)).toEqual([first, third])
      vi.mocked(getAdminEvents).mockResolvedValueOnce([])
      await store.set(adminEventsRereadAtom)
      expect(getAdminEvents).toHaveBeenLastCalledWith(TOKEN, Date.parse('2026-01-02T00:00:00.000Z'))
    })

    it('rejects to its caller and leaves the list as it is when the read fails', async () => {
      const store = await loadedStore()
      vi.mocked(getAdminEvents).mockRejectedValueOnce(new Error('network'))

      await expect(store.set(adminEventsRereadAtom)).rejects.toThrow('network')

      expect(store.get(adminEventsRemoteAtom)).toEqual([first, second])
    })

    it('reads nothing without a token', async () => {
      const store = await loadedStore()
      store.set(idTokenAtom, undefined)
      await vi.waitFor(async () => expect(await store.get(adminEventsRemoteAtom)).toEqual([]))
      vi.mocked(getAdminEvents).mockClear()

      await store.set(adminEventsRereadAtom)

      expect(getAdminEvents).not.toHaveBeenCalled()
    })

    it('drops the answer when the fetch key moved during the read, since that fetch read later', async () => {
      const store = await loadedStore()
      const read = pendingFetch()
      vi.mocked(getAdminEvents).mockReturnValueOnce(read.promise)
      const reread = store.set(adminEventsRereadAtom)
      await vi.waitFor(() => expect(getAdminEvents).toHaveBeenCalledTimes(2))

      vi.mocked(getAdminEvents).mockResolvedValueOnce([fourth])
      store.set(idTokenAtom, REFRESHED_TOKEN)
      await vi.waitFor(() => expect(store.get(adminEventsRemoteAtom)).toEqual([first, fourth]))
      read.resolve([third])
      await reread

      expect(store.get(adminEventsRemoteAtom)).toEqual([first, fourth])
    })
  })
})
