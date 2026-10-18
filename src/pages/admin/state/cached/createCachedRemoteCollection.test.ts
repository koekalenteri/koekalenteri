import type { PrimitiveAtom } from 'jotai'
import type { DataVersions, JsonUser, User } from '@/types'
import { createStore } from 'jotai'
import { vi } from 'vitest'
import { toUser } from '@/lib/wire'
import { TEST_ID_TOKEN } from '@/test-utils/utils'

const mockReadEncryptedDataset = vi.fn()
const mockWriteEncryptedDataset = vi.fn()

vi.mock('@/lib/client/encryptedStore', () => ({
  readEncryptedDataset: mockReadEncryptedDataset,
  writeEncryptedDataset: mockWriteEncryptedDataset,
}))

const dataVersions: DataVersions = {
  emailTemplates: { revision: '*:initial' },
  eventTypes: { revision: '*:initial' },
  judges: { modifiedAt: '2026-01-02T00:00:00.000Z', revision: '*:current' },
  locations: { revision: '*:initial' },
  officials: { revision: '*:initial' },
  organizers: { revision: '*:initial' },
  users: { revision: 'directory:initial' },
}

const currentUser: User = { dataVersions, email: 'admin@user.vi', id: 'user-1', name: 'Test Admin' }

vi.mock('@/api/user', () => ({ getUser: vi.fn(async () => currentUser) }))

let loadCachedRemoteCollection: typeof import('./createCachedRemoteCollection').loadCachedRemoteCollection
let atomWithCachedRemoteCollection: typeof import('./createCachedRemoteCollection').atomWithCachedRemoteCollection
let idTokenAtom: PrimitiveAtom<string | undefined>

beforeAll(async () => {
  vi.resetModules()
  vi.doMock('@/lib/client/encryptedStore', () => ({
    readEncryptedDataset: mockReadEncryptedDataset,
    writeEncryptedDataset: mockWriteEncryptedDataset,
  }))
  // Imported after the reset, so the atoms are the same instances the module under test uses.
  idTokenAtom = (await import('@/pages/state')).idTokenAtom
  const module = await import('./createCachedRemoteCollection')
  loadCachedRemoteCollection = module.loadCachedRemoteCollection
  atomWithCachedRemoteCollection = module.atomWithCachedRemoteCollection
})

const makeEffect = (fetch = vi.fn()) => {
  const promise = loadCachedRemoteCollection({ cacheKey: 'judges', fetch }, 'token', currentUser)
  return { fetch, promise }
}

describe('loadCachedRemoteCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteEncryptedDataset.mockResolvedValue(undefined)
  })

  it('returns cached data and skips fetch when the revision matches', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: ['cached'], revision: '*:current' })
    const { fetch, promise } = makeEffect()

    await expect(promise).resolves.toEqual(['cached'])

    expect(fetch).not.toHaveBeenCalled()
    expect(mockWriteEncryptedDataset).not.toHaveBeenCalled()
  })

  it('fetches and stores fresh data when the revision differs', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: ['cached'], revision: '*:stale' })
    const fetch = vi.fn().mockResolvedValueOnce(['fresh-a', 'fresh-b'])
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['fresh-a', 'fresh-b'])

    expect(fetch).toHaveBeenCalledWith('token')
    expect(mockWriteEncryptedDataset).toHaveBeenCalledWith('user-1', 'judges', ['fresh-a', 'fresh-b'], {
      revision: '*:current',
    })
  })

  it('fetches when the cached blob predates revisions', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: ['cached-a', 'cached-b'] })
    const fetch = vi.fn().mockResolvedValueOnce(['fresh'])
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['fresh'])

    expect(fetch).toHaveBeenCalledWith('token')
    expect(mockWriteEncryptedDataset).toHaveBeenCalledWith('user-1', 'judges', ['fresh'], { revision: '*:current' })
  })

  it('fetches when there is no cache', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce(undefined)
    const fetch = vi.fn().mockResolvedValueOnce(['fresh'])
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['fresh'])

    expect(fetch).toHaveBeenCalledWith('token')
  })

  it('falls back to cached data when fetch fails', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: ['cached'], revision: '*:stale' })
    const fetch = vi.fn().mockRejectedValueOnce(new Error('network'))
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['cached'])

    expect(fetch).toHaveBeenCalledWith('token')
    expect(mockWriteEncryptedDataset).not.toHaveBeenCalled()
  })

  // KOE-1463: a cache that cannot be read -- IndexedDB unavailable, or so stalled that the read
  // timed out -- is a miss like any other, so the form behind it still gets its list.
  it('fetches when the cache cannot be read', async () => {
    mockReadEncryptedDataset.mockRejectedValueOnce(new Error('indexedDB open timed out after 3000 ms'))
    const fetch = vi.fn().mockResolvedValueOnce(['fresh'])
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['fresh'])

    expect(fetch).toHaveBeenCalledWith('token')
  })

  it('serves the fetched list even when the cache cannot be written', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce(undefined)
    mockWriteEncryptedDataset.mockRejectedValueOnce(new Error('indexedDB is not available'))
    const fetch = vi.fn().mockResolvedValueOnce(['fresh'])
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['fresh'])
  })

  it('rejects when fetch fails and there is no cache', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce(undefined)
    const fetch = vi.fn().mockRejectedValueOnce(new Error('network'))
    const { promise } = makeEffect(fetch)

    await expect(promise).rejects.toThrow('network')
  })
})

describe('atomWithCachedRemoteCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteEncryptedDataset.mockResolvedValue(undefined)
  })

  const loadedCollection = async (fetch = vi.fn()) => {
    const collection = atomWithCachedRemoteCollection<string>({ cacheKey: 'judges', fetch })
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)
    await store.get(collection)
    return { collection, store }
  }

  it('applies an updater to the list the atom is currently serving', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: ['cached'], revision: '*:current' })
    const { collection, store } = await loadedCollection()

    await store.set(collection, (previous) => [...previous, 'added'])

    expect(store.get(collection)).toEqual(['cached', 'added'])
  })

  it('mirrors an update into the cache at the revision it loaded', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: ['cached'], revision: '*:current' })
    const { collection, store } = await loadedCollection()

    await store.set(collection, ['replaced'])

    expect(mockWriteEncryptedDataset).toHaveBeenCalledWith('user-1', 'judges', ['replaced'], { revision: '*:current' })
  })

  it('leaves the cache alone when an updater finds nothing to change', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: ['cached'], revision: '*:current' })
    const { collection, store } = await loadedCollection()

    await store.set(collection, (previous) => previous)

    expect(mockWriteEncryptedDataset).not.toHaveBeenCalled()
  })

  it('leaves the cache alone for a write that precedes any load', async () => {
    const collection = atomWithCachedRemoteCollection<string>({ cacheKey: 'judges', fetch: vi.fn() })
    const store = createStore()

    await store.set(collection, ['seeded'])

    expect(store.get(collection)).toEqual(['seeded'])
    expect(mockWriteEncryptedDataset).not.toHaveBeenCalled()
  })
})

describe('the cached list as the model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteEncryptedDataset.mockResolvedValue(undefined)
  })

  it('reads the ISO strings of a cached user list back as Dates (KOE-1546)', async () => {
    const stored = {
      createdAt: '2026-01-02T10:00:00.000Z',
      createdBy: 'seed',
      email: 'a@b.c',
      id: 'u2',
      lastSeen: '2026-05-01T08:00:00.000Z',
      modifiedAt: '2026-01-03T10:00:00.000Z',
      modifiedBy: 'seed',
      name: 'Cached User',
    }
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: [stored], revision: 'directory:initial' })
    const fetch = vi.fn()

    const list = await loadCachedRemoteCollection<User, JsonUser>(
      { cacheKey: 'users', fetch, revive: toUser },
      'token',
      currentUser
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(list).toEqual([
      {
        ...stored,
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
        lastSeen: new Date('2026-05-01T08:00:00.000Z'),
        modifiedAt: new Date('2026-01-03T10:00:00.000Z'),
      },
    ])
  })

  it('names a converter exactly when the model holds a Date', () => {
    // @ts-expect-error A user holds Dates, so the cached list cannot be read without its converter.
    atomWithCachedRemoteCollection<User, JsonUser>({ cacheKey: 'users', fetch: vi.fn() })
    // @ts-expect-error A judge holds no Date: its JSON is its model, and there is nothing to convert.
    atomWithCachedRemoteCollection<string>({ cacheKey: 'judges', fetch: vi.fn(), revive: (item: string) => item })

    expect(atomWithCachedRemoteCollection<string>({ cacheKey: 'judges', fetch: vi.fn() })).toBeDefined()
  })
})
