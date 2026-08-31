import type { PrimitiveAtom } from 'jotai'
import type { DataVersions, User } from '../../../../types'
import { createStore } from 'jotai'
import { vi } from 'vitest'
import { TEST_ID_TOKEN } from '../../../../test-utils/utils'

const mockReadEncryptedDataset = vi.fn()
const mockWriteEncryptedDataset = vi.fn()

vi.mock('../../../../lib/client/encryptedStore', () => ({
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

vi.mock('../../../../api/user', () => ({ getUser: vi.fn(async () => currentUser) }))

let loadCachedRemoteCollection: typeof import('./createCachedRemoteCollection').loadCachedRemoteCollection
let atomWithCachedRemoteCollection: typeof import('./createCachedRemoteCollection').atomWithCachedRemoteCollection
let idTokenAtom: PrimitiveAtom<string | undefined>

beforeAll(async () => {
  vi.resetModules()
  vi.doMock('../../../../lib/client/encryptedStore', () => ({
    readEncryptedDataset: mockReadEncryptedDataset,
    writeEncryptedDataset: mockWriteEncryptedDataset,
  }))
  // Imported after the reset, so the atoms are the same instances the module under test uses.
  idTokenAtom = (await import('../../../state')).idTokenAtom
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
