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
  /**
   * Where an update should be mirrored, recorded by the load that produced the list being updated.
   * Taken from the load rather than read from `userAtom` in the writer, so that seeding the atom -
   * a test fixture, or any write before anything has read the collection - never triggers a `/user`
   * request or stores a blob for a user whose data this list is not.
   */
  let cacheTarget: { revision?: string; userId: string } | undefined

  const remoteAtom = atom(async (get) => {
    const token = get(validIdTokenAtom)
    const user = await get(userAtom)
    if (!token || !user?.id) return []

    cacheTarget = { revision: user.dataVersions?.[cacheKey]?.revision, userId: user.id }
    return loadCachedRemoteCollection({ cacheKey, fetch, sort }, token, user)
  })
  const overrideAtom = atom<T[] | undefined>(undefined)
  return atom(
    (get) => get(overrideAtom) ?? get(remoteAtom),
    async (get, set, value: T[] | ((previous: T[]) => T[])) => {
      let next: T[]
      if (typeof value === 'function') {
        // An updater builds on whatever the atom currently reads: the override once one has been
        // written, the loaded (cached or fetched) remote list until then.
        const previous = get(overrideAtom) ?? (await get(remoteAtom))
        next = value(previous)
        // An update that changed nothing - an incremental refresh that found nothing new - has
        // nothing to store and nothing to notify about.
        if (next === previous) return next
      } else {
        next = value
      }
      set(overrideAtom, next)

      // Mirror the write into the cache. Without this the blob keeps the list as it was at the last
      // fetch, so every update in this session costs a full refetch in the next one. The revision
      // recorded is the one this browser knew when it loaded, exactly as in the fetch path above:
      // if the collection changed after that, the blob refetches once more later, never the other
      // way round.
      if (cacheTarget) {
        await writeEncryptedDataset(cacheTarget.userId, cacheKey, next, {
          revision: cacheTarget.revision,
        }).catch(() => undefined)
      }

      return next
    }
  )
}
