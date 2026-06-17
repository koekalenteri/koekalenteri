import { DATASETS, idbClear, idbDeleteDatabase, idbGet, idbSet, KEYSTORE } from './idb'

const KEY_META_ID = 'meta'
const KEY_ID = 'aes-key'

interface KeyMeta {
  userId: string
}

interface CachedDatasetMeta {
  count: number
  modifiedAt?: string
  storedAt: string
  userId: string
}

interface CachedDataset<T> extends CachedDatasetMeta {
  data: T
}

interface EncryptedDataset extends CachedDatasetMeta {
  cipherText: ArrayBuffer
  iv: ArrayBuffer
}

let keyPromise: Promise<CryptoKey> | undefined
let activeUserId: string | undefined

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function createKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ length: 256, name: 'AES-GCM' }, false, ['decrypt', 'encrypt'])
}

async function resetForUser(userId: string): Promise<CryptoKey> {
  await idbClear(DATASETS)
  const key = await createKey()
  await idbSet(KEYSTORE, KEY_ID, key)
  await idbSet<KeyMeta>(KEYSTORE, KEY_META_ID, { userId })
  activeUserId = userId
  keyPromise = Promise.resolve(key)
  return key
}

async function getKey(userId: string): Promise<CryptoKey> {
  if (keyPromise && activeUserId === userId) return keyPromise

  keyPromise = (async () => {
    const meta = await idbGet<KeyMeta>(KEYSTORE, KEY_META_ID)
    const key = await idbGet<CryptoKey>(KEYSTORE, KEY_ID)

    if (!meta || !key || meta.userId !== userId) {
      return resetForUser(userId)
    }

    activeUserId = userId
    return key
  })()

  return keyPromise
}

const datasetKey = (userId: string, key: string) => `${userId}:${key}`

export async function readEncryptedDataset<T>(userId: string, key: string): Promise<CachedDataset<T> | undefined> {
  const cryptoKey = await getKey(userId)
  const stored = await idbGet<EncryptedDataset>(DATASETS, datasetKey(userId, key))
  if (stored?.userId !== userId) return undefined

  const plaintext = await crypto.subtle.decrypt({ iv: stored.iv, name: 'AES-GCM' }, cryptoKey, stored.cipherText)
  const data = JSON.parse(decoder.decode(plaintext)) as T

  return { ...stored, data }
}

export async function writeEncryptedDataset<T>(
  userId: string,
  key: string,
  data: T,
  meta: Pick<CachedDatasetMeta, 'count' | 'modifiedAt'>
): Promise<void> {
  const cryptoKey = await getKey(userId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipherText = await crypto.subtle.encrypt(
    { iv, name: 'AES-GCM' },
    cryptoKey,
    encoder.encode(JSON.stringify(data))
  )

  await idbSet<EncryptedDataset>(DATASETS, datasetKey(userId, key), {
    cipherText,
    count: meta.count,
    iv: iv.buffer.slice(0),
    modifiedAt: meta.modifiedAt,
    storedAt: new Date().toISOString(),
    userId,
  })
}

export async function clearEncryptedStore(): Promise<void> {
  activeUserId = undefined
  keyPromise = undefined
  await idbDeleteDatabase()
}
