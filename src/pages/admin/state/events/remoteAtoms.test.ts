import type { DogEvent } from '@/types'
import { createStore } from 'jotai'
import { getAdminEvents } from '@/api/event'
import { idTokenAtom } from '@/pages/state'
import { TEST_ID_TOKEN } from '@/test-utils/utils'
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
  const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  // A second valid token, as a session refresh or a new login hands out
  const NEXT_ID_TOKEN = `header.${encodeBase64Url(JSON.stringify({ exp: 4102444800, iat: 2 }))}.signature`

  const first = event('first', '2026-02-01', '2026-01-01')
  const second = event('second', '2026-03-01', '2026-01-01')
  const third = event('third', '2026-04-01', '2026-01-02')

  beforeEach(() => {
    vi.mocked(getAdminEvents).mockReset()
  })

  it('layers a local write on the fetched list', async () => {
    vi.mocked(getAdminEvents).mockResolvedValue([first])
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)
    await expect(store.get(adminEventsRemoteAtom)).resolves.toEqual([first])

    store.set(adminEventsRemoteAtom, (events) => [...events, second])

    expect(store.get(adminEventsRemoteAtom)).toEqual([first, second])
    expect(getAdminEvents).toHaveBeenCalledTimes(1)
  })

  it('serves the next fetch instead of the local list once the token has changed (KOE-1500)', async () => {
    vi.mocked(getAdminEvents).mockResolvedValueOnce([]).mockResolvedValueOnce([first, second, third])
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)
    await expect(store.get(adminEventsRemoteAtom)).resolves.toEqual([])
    // A websocket patch arrives into the empty list, and the list is now a local one
    store.set(adminEventsRemoteAtom, [second])
    expect(store.get(adminEventsRemoteAtom)).toEqual([second])

    // Sign out, then sign in again
    store.set(idTokenAtom, undefined)
    await expect(store.get(adminEventsRemoteAtom)).resolves.toEqual([])
    store.set(idTokenAtom, NEXT_ID_TOKEN)

    await expect(store.get(adminEventsRemoteAtom)).resolves.toEqual([first, second, third])
    expect(getAdminEvents).toHaveBeenCalledTimes(2)
  })

  it('lets a local write after the new fetch build on the new list', async () => {
    vi.mocked(getAdminEvents).mockResolvedValueOnce([first]).mockResolvedValueOnce([first, second])
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)
    await expect(store.get(adminEventsRemoteAtom)).resolves.toEqual([first])
    store.set(adminEventsRemoteAtom, [])

    store.set(idTokenAtom, NEXT_ID_TOKEN)
    await expect(store.get(adminEventsRemoteAtom)).resolves.toEqual([first, second])
    store.set(adminEventsRemoteAtom, (events) => [...events, third])

    expect(store.get(adminEventsRemoteAtom)).toEqual([first, second, third])
  })
})
