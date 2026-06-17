import type { AtomEffect } from 'recoil'
import type { DataVersion, DataVersions } from '../../../../types'
import { DefaultValue } from 'recoil'
import { readEncryptedDataset, writeEncryptedDataset } from '../../../../lib/client/encryptedStore'
import { idTokenAtom, userSelector } from '../../../recoil'

interface CachedCollectionOptions<T> {
  cacheKey: keyof DataVersions
  fetch: (token: string) => Promise<T[]>
  sort?: (items: T[]) => T[]
}

const isFresh = (cached: DataVersion | undefined, current: DataVersion | undefined): boolean => {
  if (!cached || !current) return false
  if (cached.count !== current.count) return false
  if (!current.modifiedAt) return true
  return Boolean(cached.modifiedAt && cached.modifiedAt >= current.modifiedAt)
}

export function createCachedRemoteCollectionEffect<T>({
  cacheKey,
  fetch,
  sort,
}: CachedCollectionOptions<T>): AtomEffect<T[]> {
  return ({ getPromise, setSelf, trigger }) => {
    if (trigger !== 'get') return

    setSelf(
      Promise.all([getPromise(idTokenAtom), getPromise(userSelector)]).then(async ([token, user]) => {
        const currentUser = user
        if (!token || !currentUser?.id) return new DefaultValue()

        const version = currentUser.dataVersions?.[cacheKey]
        const cached = await readEncryptedDataset<T[]>(currentUser.id, cacheKey).catch(() => undefined)

        let sortedCached = cached?.data
        if (cached && sort) {
          sortedCached = sort([...cached.data])
        }

        if (sortedCached && isFresh(cached, version)) {
          return sortedCached
        }

        try {
          const fresh = await fetch(token)
          const sorted = sort ? sort([...fresh]) : fresh
          // Store the actual fetched count to keep the cache self-consistent if the server
          // dataset changed between the dataVersions snapshot and this fetch.
          await writeEncryptedDataset(currentUser.id, cacheKey, sorted, {
            count: sorted.length,
            modifiedAt: version?.modifiedAt,
          }).catch(() => undefined)

          return sorted
        } catch (err) {
          // Fall back to cached data on fetch failure to keep the UI working through outages.
          if (sortedCached) return sortedCached
          throw err
        }
      })
    )
  }
}
