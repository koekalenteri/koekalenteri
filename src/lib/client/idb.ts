const DB_NAME = 'koekalenteri-cache'
const DB_VERSION = 1

export const KEYSTORE = 'keystore'
export const DATASETS = 'datasets'

type StoreName = typeof KEYSTORE | typeof DATASETS

let dbPromise: Promise<IDBDatabase> | undefined

const openDatabase = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('indexedDB is not available'))
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KEYSTORE)) db.createObjectStore(KEYSTORE)
      if (!db.objectStoreNames.contains(DATASETS)) db.createObjectStore(DATASETS)
    }

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })

  return dbPromise
}

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })

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

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}
