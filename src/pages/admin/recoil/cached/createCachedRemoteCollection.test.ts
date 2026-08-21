import type { User } from '../../../../types'
import { vi } from 'vitest'

const mockReadEncryptedDataset = vi.fn()
const mockWriteEncryptedDataset = vi.fn()

vi.mock('../../../../lib/client/encryptedStore', () => ({
  readEncryptedDataset: mockReadEncryptedDataset,
  writeEncryptedDataset: mockWriteEncryptedDataset,
}))

let validIdTokenSelector: typeof import('../../../recoil').validIdTokenSelector
let userSelector: typeof import('../../../recoil').userSelector
let createCachedRemoteCollectionEffect: typeof import('./createCachedRemoteCollection').createCachedRemoteCollectionEffect

beforeAll(async () => {
  vi.resetModules()
  vi.doMock('../../../../lib/client/encryptedStore', () => ({
    readEncryptedDataset: mockReadEncryptedDataset,
    writeEncryptedDataset: mockWriteEncryptedDataset,
  }))
  const recoil = await import('../../../recoil')
  validIdTokenSelector = recoil.validIdTokenSelector
  userSelector = recoil.userSelector
  createCachedRemoteCollectionEffect = (await import('./createCachedRemoteCollection'))
    .createCachedRemoteCollectionEffect
})

const makeEffect = (fetch = vi.fn()) => {
  const effect = createCachedRemoteCollectionEffect<string>({
    cacheKey: 'judges',
    fetch,
  })
  let promise: Promise<string[]> | undefined
  const setSelf = vi.fn((value: Promise<string[]>) => {
    promise = value
  })
  const getPromise = vi.fn((recoilValue: unknown) => {
    if (recoilValue === validIdTokenSelector) return Promise.resolve('token')
    if (recoilValue === userSelector) {
      return Promise.resolve({
        dataVersions: {
          emailTemplates: { count: 0 },
          eventTypes: { count: 0 },
          judges: { count: 1, modifiedAt: '2026-01-02T00:00:00.000Z' },
          officials: { count: 0 },
          users: { count: 0 },
        },
        id: 'user-1',
      } satisfies Partial<User>)
    }
    return Promise.resolve(undefined)
  })

  effect({ getPromise, setSelf, trigger: 'get' } as any)

  expect(setSelf).toHaveBeenCalledWith(expect.any(Promise))
  return { fetch, promise: promise as Promise<string[]>, setSelf }
}

describe('createCachedRemoteCollectionEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteEncryptedDataset.mockResolvedValue(undefined)
  })

  it('returns cached data and skips fetch when cache is fresh', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({
      count: 1,
      data: ['cached'],
      modifiedAt: '2026-01-02T00:00:00.000Z',
    })
    const { fetch, promise } = makeEffect()

    await expect(promise).resolves.toEqual(['cached'])

    expect(fetch).not.toHaveBeenCalled()
    expect(mockWriteEncryptedDataset).not.toHaveBeenCalled()
  })

  it('fetches and stores fresh data when cache is stale', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({
      count: 1,
      data: ['cached'],
      modifiedAt: '2026-01-01T00:00:00.000Z',
    })
    const fetch = vi.fn().mockResolvedValueOnce(['fresh-a', 'fresh-b'])
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['fresh-a', 'fresh-b'])

    expect(fetch).toHaveBeenCalledWith('token')
    expect(mockWriteEncryptedDataset).toHaveBeenCalledWith('user-1', 'judges', ['fresh-a', 'fresh-b'], {
      count: 2,
      modifiedAt: '2026-01-02T00:00:00.000Z',
    })
  })

  it('fetches when cached count differs from current version count', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({
      count: 2,
      data: ['cached-a', 'cached-b'],
      modifiedAt: '2026-01-02T00:00:00.000Z',
    })
    const fetch = vi.fn().mockResolvedValueOnce(['fresh'])
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['fresh'])

    expect(fetch).toHaveBeenCalledWith('token')
    expect(mockWriteEncryptedDataset).toHaveBeenCalledWith('user-1', 'judges', ['fresh'], {
      count: 1,
      modifiedAt: '2026-01-02T00:00:00.000Z',
    })
  })

  it('fetches when there is no cache', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce(undefined)
    const fetch = vi.fn().mockResolvedValueOnce(['fresh'])
    const { promise } = makeEffect(fetch)

    await expect(promise).resolves.toEqual(['fresh'])

    expect(fetch).toHaveBeenCalledWith('token')
  })

  it('falls back to cached data when fetch fails', async () => {
    mockReadEncryptedDataset.mockResolvedValueOnce({
      count: 1,
      data: ['cached'],
      modifiedAt: '2026-01-01T00:00:00.000Z',
    })
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
