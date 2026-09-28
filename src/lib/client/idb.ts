import { withTimeout } from '../utils'

const DB_NAME = 'koekalenteri-cache'
const DB_VERSION = 1

export const KEYSTORE = 'keystore'
export const DATASETS = 'datasets'

/**
 * How long one IndexedDB operation is given before it counts as a failure. Everything stored here
 * is a cache in front of an API call, so waiting is worth it only while it beats the fetch it
 * saves. A browser that answers an operation with neither `success` nor `error` -- Safari after a
 * restore, an open held up by another tab, a profile whose storage has gone bad -- would otherwise
 * leave every reader waiting forever, and the admin event form, which loads six cached collections
 * before it renders anything, spinning with nothing to say (KOE-1463).
 */
const TIMEOUT_MS = 3000

type StoreName = typeof KEYSTORE | typeof DATASETS

let dbPromise: Promise<IDBDatabase> | undefined

/** `request.error` is nullable, but a promise should always reject with an `Error`. */
const requestError = (request: IDBRequest | IDBOpenDBRequest, action: string): Error =>
  request.error ?? new Error(`indexedDB ${action} failed`)

const openDatabase = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('indexedDB is not available'))
  if (dbPromise) return dbPromise

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KEYSTORE)) db.createObjectStore(KEYSTORE)
      if (!db.objectStoreNames.contains(DATASETS)) db.createObjectStore(DATASETS)
    }

    // `blocked` means another connection is holding the version this open would replace. It is not
    // a state that resolves on its own here, so it is reported rather than waited out.
    request.onblocked = () => reject(new Error('indexedDB open is blocked'))
    request.onerror = () => reject(requestError(request, 'open'))
    request.onsuccess = () => resolve(request.result)
  })

  const opened = withTimeout(opening, TIMEOUT_MS, 'indexedDB open')
  dbPromise = opened
  opened.catch(() => {
    // A failed open is not remembered: the next read opens again instead of inheriting the failure
    // for the rest of the session. A connection that still arrives after the timeout is closed, so
    // it cannot hold up a later version change.
    if (dbPromise === opened) dbPromise = undefined
    opening.then(
      (db) => db.close(),
      () => undefined
    )
  })

  return opened
}

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  withTimeout(
    new Promise<T>((resolve, reject) => {
      request.onerror = () => reject(requestError(request, 'request'))
      request.onsuccess = () => resolve(request.result)
    }),
    TIMEOUT_MS,
    'indexedDB request'
  )

const store = async (name: StoreName, mode: IDBTransactionMode = 'readonly') => {
  const db = await openDatabase()
  return db.transaction(name, mode).objectStore(name)
}

export const idbGet = async <T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> =>
  requestToPromise<T | undefined>((await store(storeName)).get(key))

export const idbSet = async <T>(storeName: StoreName, key: IDBValidKey, value: T): Promise<IDBValidKey> =>
  requestToPromise((await store(storeName, 'readwrite')).put(value, key))

export const idbClear = async (storeName: StoreName): Promise<undefined> =>
  requestToPromise((await store(storeName, 'readwrite')).clear())

export const idbDeleteDatabase = (): Promise<void> => {
  dbPromise = undefined

  return withTimeout(
    new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME)

      // Deleting waits for every open connection to close, this page's included, and reports that
      // wait as `blocked`. The delete may still go through later; the caller is only told that it
      // cannot be counted on, which is what the timeout says too.
      request.onerror = () => reject(requestError(request, 'deleteDatabase'))
      request.onsuccess = () => resolve()
    }),
    TIMEOUT_MS,
    'indexedDB deleteDatabase'
  )
}
