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
  if (sortedCached && isFresh(cached?.revision, version)) return sortedCached
  try {
    const fresh = await fetch(token)
    const sorted = sort ? sort([...fresh]) : fresh
    // The revision is the one reported before the fetch: if the collection changed in between, the
    // blob is recorded as older than its data and refetches once more later. Never the other way.
    await writeEncryptedDataset(user.id, cacheKey, sorted, { revision: version?.revision }).catch(() => undefined)
    return sorted
  } catch (error) {
    if (sortedCached) return sortedCached
    throw error
  }
}

// A blob written before versions existed has no revision and is always refetched once.
const isFresh = (cachedRevision: string | undefined, current: DataVersion | undefined): boolean =>
  Boolean(cachedRevision && current?.revision && cachedRevision === current.revision)

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
