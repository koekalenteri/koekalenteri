import type { User } from '../../../../types'
import { vi } from 'vitest'

const mockReadEncryptedDataset = vi.fn()
const mockWriteEncryptedDataset = vi.fn()

vi.mock('../../../../lib/client/encryptedStore', () => ({
  readEncryptedDataset: mockReadEncryptedDataset,
  writeEncryptedDataset: mockWriteEncryptedDataset,
}))

let loadCachedRemoteCollection: typeof import('./createCachedRemoteCollection').loadCachedRemoteCollection

beforeAll(async () => {
  vi.resetModules()
  vi.doMock('../../../../lib/client/encryptedStore', () => ({
    readEncryptedDataset: mockReadEncryptedDataset,
    writeEncryptedDataset: mockWriteEncryptedDataset,
  }))
  loadCachedRemoteCollection = (await import('./createCachedRemoteCollection')).loadCachedRemoteCollection
})

const makeEffect = (fetch = vi.fn()) => {
  const promise = loadCachedRemoteCollection({ cacheKey: 'judges', fetch }, 'token', {
    dataVersions: {
      emailTemplates: { revision: '*:initial' },
      eventTypes: { revision: '*:initial' },
      judges: { modifiedAt: '2026-01-02T00:00:00.000Z', revision: '*:current' },
      locations: { revision: '*:initial' },
      officials: { revision: '*:initial' },
      users: { revision: 'directory:initial' },
    },
    id: 'user-1',
  } satisfies Partial<User> as User)
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
