import type { MaybePromise } from '@/lib/maybePromise'
import type { ReviveOption } from '@/lib/wire'
import type { DataVersion, DataVersions } from '@/types'
import { atom } from 'jotai'
import { readEncryptedDataset, writeEncryptedDataset } from '@/lib/client/encryptedStore'
import { asSettled, mapMaybe } from '@/lib/maybePromise'
import { userAtom, validIdTokenAtom } from '@/pages/state'
import { loadedAtom } from '@/pages/state/loadedAtom'

/**
 * `revive` (KOE-1546) is the model of an item read back from the cache, from its JSON shape as
 * `lib/wire.ts` makes it: the blob holds the list as JSON, so a `Date` comes back as the ISO string
 * it was written as. Required exactly when the model holds a Date; a model without one is its own JSON.
 */
type CachedCollectionOptions<T, J = T> = {
  cacheKey: keyof DataVersions
  fetch: (token: string) => Promise<T[]>
  sort?: (items: T[]) => T[]
} & ReviveOption<T, J>

const sorted = <T>(items: T[], sort?: (items: T[]) => T[]): T[] => (sort ? sort([...items]) : items)

/** The cached list as the model. Without a converter the model holds no Date, and its JSON is the model. */
const readCachedItems = async <T, J>(userId: string, cacheKey: keyof DataVersions, revive?: (item: J) => T) => {
  if (!revive) return readEncryptedDataset<T[]>(userId, cacheKey)
  const cached = await readEncryptedDataset<J[]>(userId, cacheKey)
  return cached && { ...cached, data: cached.data.map(revive) }
}

export async function loadCachedRemoteCollection<T, J = T>(
  { cacheKey, fetch, revive, sort }: CachedCollectionOptions<T, J>,
  token: string,
  user: { id: string; dataVersions?: DataVersions }
) {
  const version = user.dataVersions?.[cacheKey]
  const cached = await readCachedItems(user.id, cacheKey, revive).catch(() => undefined)
  const sortedCached = cached ? sorted(cached.data, sort) : undefined
  if (sortedCached && isFresh(cached?.revision, version)) return sortedCached
  try {
    const fresh = sorted(await fetch(token), sort)
    // The revision is the one reported before the fetch: if the collection changed in between, the
    // blob is recorded as older than its data and refetches once more later. Never the other way.
    await writeEncryptedDataset(user.id, cacheKey, fresh, { revision: version?.revision }).catch(() => undefined)
    return fresh
  } catch (error) {
    if (sortedCached) return sortedCached
    throw error
  }
}

// A blob written before versions existed has no revision and is always refetched once.
const isFresh = (cachedRevision: string | undefined, current: DataVersion | undefined): boolean =>
  Boolean(cachedRevision && current?.revision && cachedRevision === current.revision)

export function atomWithCachedRemoteCollection<T, J = T>(options: CachedCollectionOptions<T, J>) {
  const { cacheKey } = options
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
    return loadCachedRemoteCollection(options, token, user)
  })
  const overrideAtom = atom<T[] | undefined>(undefined)
  // Once the load has settled, a dependent reading it in a plain getter gets the array instead
  // of a Promise to suspend on, and a later load, after a refreshed id token, never suspends the
  // page reading the list (loadedAtom).
  const loadedListAtom = loadedAtom(remoteAtom)
  return atom(
    (get) => asSettled(get(overrideAtom) ?? get(loadedListAtom)),
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

/**
 * The item with `id` from a collection that may still be loading. A loaded list is searched
 * synchronously, so a subscriber does not suspend on a Promise for a value it already has.
 */
export const findInCollection = <T extends { id: string }>(
  items: MaybePromise<T[]>,
  id: string
): MaybePromise<T | undefined> => mapMaybe(items, (loaded) => loaded.find((item) => item.id === id))
