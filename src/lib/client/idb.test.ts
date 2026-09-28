// This file hand-rolls a minimal IndexedDB double, like encryptedStore.test.ts does, because what
// it tests is the one thing a real implementation never does on demand: answer nothing at all.

type Behavior = 'success' | 'error' | 'blocked' | 'silent'

let openBehavior: Behavior = 'success'
let getBehavior: Behavior = 'success'
let openCount = 0
let closeCount = 0
let lastOpenRequest: IDBOpenDBRequest | undefined

const answer = (request: IDBRequest | IDBOpenDBRequest, behavior: Behavior) => {
  if (behavior === 'success') setTimeout(() => request.onsuccess?.({} as Event), 0)
  if (behavior === 'error') setTimeout(() => request.onerror?.({} as Event), 0)
}

const objectStore = () => ({
  get: () => {
    const request = {} as IDBRequest<unknown>
    answer(request, getBehavior)
    return request
  },
})

const db = {
  close: () => {
    closeCount += 1
  },
  createObjectStore: () => undefined,
  objectStoreNames: { contains: () => true },
  transaction: () => ({ objectStore }),
} as unknown as IDBDatabase

Object.defineProperty(globalThis, 'indexedDB', {
  configurable: true,
  value: {
    deleteDatabase: () => ({}) as IDBOpenDBRequest,
    open: () => {
      openCount += 1
      const request = { result: db } as IDBOpenDBRequest
      lastOpenRequest = request
      answer(request, openBehavior)
      if (openBehavior === 'blocked') setTimeout(() => request.onblocked?.({} as IDBVersionChangeEvent), 0)
      return request
    },
  },
})

/** A module of its own per test: the open database is module state that outlives one call. */
const loadIdb = async () => {
  vi.resetModules()
  return import('./idb')
}

beforeEach(() => {
  vi.useFakeTimers()
  openBehavior = 'success'
  getBehavior = 'success'
  openCount = 0
  closeCount = 0
  lastOpenRequest = undefined
})

afterEach(() => vi.useRealTimers())

describe('idbGet', () => {
  it('reads through an open database', async () => {
    const { idbGet } = await loadIdb()
    const read = idbGet('datasets', 'key')

    await vi.runAllTimersAsync()

    await expect(read).resolves.toBeUndefined()
    expect(openCount).toBe(1)
  })

  it('reuses the open database for later reads', async () => {
    const { idbGet } = await loadIdb()
    const reads = Promise.all([idbGet('datasets', 'key'), idbGet('datasets', 'other')])

    await vi.runAllTimersAsync()
    await reads

    expect(openCount).toBe(1)
  })

  // KOE-1463: an open that answers neither `success` nor `error` used to leave every reader of the
  // cache waiting for as long as the page was open.
  it('gives up on an open that never answers', async () => {
    const { idbGet } = await loadIdb()
    openBehavior = 'silent'
    const read = expect(idbGet('datasets', 'key')).rejects.toThrow('indexedDB open timed out')

    await vi.advanceTimersByTimeAsync(3000)
    await read
  })

  it('does not hold on to a failed open', async () => {
    const { idbGet } = await loadIdb()
    openBehavior = 'silent'
    const failed = expect(idbGet('datasets', 'key')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(3000)
    await failed

    openBehavior = 'success'
    const read = idbGet('datasets', 'key')
    await vi.runAllTimersAsync()

    await expect(read).resolves.toBeUndefined()
    expect(openCount).toBe(2)
  })

  it('closes a connection that arrives after the timeout', async () => {
    const { idbGet } = await loadIdb()
    openBehavior = 'silent'
    const failed = expect(idbGet('datasets', 'key')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(3000)
    await failed

    lastOpenRequest?.onsuccess?.({} as Event)
    await vi.runAllTimersAsync()

    expect(closeCount).toBe(1)
  })

  it('reports an open another connection is blocking', async () => {
    const { idbGet } = await loadIdb()
    openBehavior = 'blocked'
    const read = expect(idbGet('datasets', 'key')).rejects.toThrow('indexedDB open is blocked')

    await vi.advanceTimersByTimeAsync(0)
    await read
  })

  it('gives up on a read that never answers', async () => {
    const { idbGet } = await loadIdb()
    getBehavior = 'silent'
    const read = expect(idbGet('datasets', 'key')).rejects.toThrow('indexedDB request timed out')

    await vi.advanceTimersByTimeAsync(3000)
    await read
  })
})
