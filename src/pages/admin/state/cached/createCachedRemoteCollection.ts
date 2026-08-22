import type { DataVersion, DataVersions } from '../../../../types'
import { atom } from 'jotai'
import { readEncryptedDataset, writeEncryptedDataset } from '../../../../lib/client/encryptedStore'
import { userAtom, validIdTokenAtom } from '../../../state'

interface CachedCollectionOptions<T> {
  cacheKey: keyof DataVersions
  fetch: (token: string) => Promise<T[]>
  sort?: (items: T[]) => T[]
}

export async function loadCachedRemoteCollection<T>(
  { cacheKey, fetch, sort }: CachedCollectionOptions<T>,
  token: string,
  user: { id: string; dataVersions?: DataVersions }
) {
  const version = user.dataVersions?.[cacheKey]
  const cached = await readEncryptedDataset<T[]>(user.id, cacheKey).catch(() => undefined)
  const sortedCached = cached ? (sort ? sort([...cached.data]) : cached.data) : undefined
  if (sortedCached && isFresh(cached, version)) return sortedCached
  try {
    const fresh = await fetch(token)
    const sorted = sort ? sort([...fresh]) : fresh
    await writeEncryptedDataset(user.id, cacheKey, sorted, {
      count: sorted.length,
      modifiedAt: version?.modifiedAt,
    }).catch(() => undefined)
    return sorted
  } catch (error) {
    if (sortedCached) return sortedCached
    throw error
  }
}

const isFresh = (cached: DataVersion | undefined, current: DataVersion | undefined): boolean => {
  if (!cached || !current || cached.count !== current.count) return false
  if (!current.modifiedAt) return true
  return Boolean(cached.modifiedAt && cached.modifiedAt >= current.modifiedAt)
}

export function atomWithCachedRemoteCollection<T>({ cacheKey, fetch, sort }: CachedCollectionOptions<T>) {
  const remoteAtom = atom(async (get) => {
    const [token, user] = await Promise.all([get(validIdTokenAtom), get(userAtom)])
    if (!token || !user?.id) return []

    return loadCachedRemoteCollection({ cacheKey, fetch, sort }, token, user)
  })
  const overrideAtom = atom<T[] | undefined>(undefined)
  return atom(
    (get) => get(overrideAtom) ?? get(remoteAtom),
    (_get, set, value: T[] | ((previous: T[]) => T[])) => {
      const previous = set(overrideAtom, (current) => {
        if (typeof value !== 'function') return value
        if (!current) throw new Error('Cannot update a remote atom before it has loaded')
        return value(current)
      })
      return previous
    }
  )
}
