import { webcrypto } from 'node:crypto'

type Store = Map<IDBValidKey, unknown>

let stores: Record<string, Store>

const request = <T>(result?: T): IDBRequest<T> => {
  const req = { result } as IDBRequest<T>
  setTimeout(() => req.onsuccess?.({ target: req } as unknown as Event), 0)
  return req
}

const objectStore = (name: string) => ({
  clear: () => {
    stores[name].clear()
    return request(undefined)
  },
  get: (key: IDBValidKey) => request(stores[name].get(key)),
  put: (value: unknown, key: IDBValidKey) => {
    stores[name].set(key, value)
    return request(key)
  },
})

const db = {
  createObjectStore: (name: string) => {
    stores[name] ??= new Map()
  },
  objectStoreNames: {
    contains: (name: string) => Boolean(stores[name]),
  },
  transaction: (name: string) => ({ objectStore: () => objectStore(name) }),
} as unknown as IDBDatabase

Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
Object.defineProperty(globalThis, 'indexedDB', {
  configurable: true,
  value: {
    deleteDatabase: () => {
      stores = { datasets: new Map(), keystore: new Map() }
      return request(undefined)
    },
    open: () => {
      const req = { result: db } as IDBOpenDBRequest
      setTimeout(() => {
        req.onupgradeneeded?.({ target: req } as unknown as IDBVersionChangeEvent)
        req.onsuccess?.({ target: req } as unknown as Event)
      }, 0)
      return req
    },
  },
})

let clearEncryptedStore: typeof import('./encryptedStore').clearEncryptedStore
let readEncryptedDataset: typeof import('./encryptedStore').readEncryptedDataset
let writeEncryptedDataset: typeof import('./encryptedStore').writeEncryptedDataset

describe('encryptedStore', () => {
  beforeAll(async () => {
    const module = await import('./encryptedStore')
    clearEncryptedStore = module.clearEncryptedStore
    readEncryptedDataset = module.readEncryptedDataset
    writeEncryptedDataset = module.writeEncryptedDataset
  })

  beforeEach(async () => {
    stores = { datasets: new Map(), keystore: new Map() }
    await clearEncryptedStore()
  })

  it('encrypts and decrypts a cached dataset', async () => {
    await writeEncryptedDataset('user-1', 'judges', ['judge-a'], {
      count: 1,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    })

    const raw = stores.datasets.get('user-1:judges') as { cipherText: ArrayBuffer }
    expect(raw).toBeDefined()
    expect(new TextDecoder().decode(raw.cipherText)).not.toContain('judge-a')

    await expect(readEncryptedDataset<string[]>('user-1', 'judges')).resolves.toMatchObject({
      count: 1,
      data: ['judge-a'],
      modifiedAt: '2026-01-01T00:00:00.000Z',
      userId: 'user-1',
    })
  })

  it('wipes datasets and creates a new key when the user changes', async () => {
    await writeEncryptedDataset('user-1', 'judges', ['judge-a'], { count: 1 })
    expect(stores.datasets.has('user-1:judges')).toBe(true)

    await writeEncryptedDataset('user-2', 'judges', ['judge-b'], { count: 1 })

    expect(stores.datasets.has('user-1:judges')).toBe(false)
    await expect(readEncryptedDataset<string[]>('user-2', 'judges')).resolves.toMatchObject({ data: ['judge-b'] })
  })

  it('clears the database on explicit clear', async () => {
    await writeEncryptedDataset('user-1', 'judges', ['judge-a'], { count: 1 })

    await clearEncryptedStore()

    await expect(readEncryptedDataset<string[]>('user-1', 'judges')).resolves.toBeUndefined()
  })
})
