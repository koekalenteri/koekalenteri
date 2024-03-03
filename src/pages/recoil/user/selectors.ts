import { selector } from 'recoil'

import { getUser } from '../../../api/user'
import { reportError } from '../../../lib/client/rum'

import { idTokenAtom } from './atoms'

export const userSelector = selector({
  key: 'user',
  get: async ({ get }) => {
    try {
      const token = get(idTokenAtom)
      if (!token) return null

      const user = await getUser(token)
      return user
    } catch (e) {
      reportError(e)
    }

    return null
  },
  /**
   * Defines the behavior of the internal selector cache. Can be useful to control the memory footprint in apps that
   * have selectors with many changing dependencies.
   *  @property {'lru'|'keep-all'|'most-recent'} eviction - can be set to lru (which requires that a maxSize is set), keep-all (default), or most-recent.
   *    An lru cache will evict the least-recently-used value from the selector cache when the size of the cache
   *    exceeds maxSize. A keep-all policy will mean all selector dependencies and their values will be indefinitely
   *    stored in the selector cache. A most-recent policy will use a cache of size 1 and will retain only the most
   *    recently saved set of dependencies and their values.
   *  * Note the cache stores the values of the selector based on a key containing all dependencies and their values.
   *    This means the size of the internal selector cache depends on both the size of the selector values as well as
   *    the number of unique values of all dependencies.
   *  * Note the default eviction policy (currently keep-all) may change in the future.
   **/
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
})

export const isAdminSelector = selector({
  key: 'isAdmin',
  get: async ({ get }) => {
    const user = get(userSelector)
    return user?.admin === true
  },
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
})

export const isOrgAdminSelector = selector({
  key: 'isOrgAdmin',
  get: async ({ get }) => {
    const user = get(userSelector)
    const roles = user?.roles ?? {}
    return user?.admin === true || Object.keys(roles).some((key) => roles[key] === 'admin')
  },
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
})

export const hasAdminAccessSelector = selector({
  key: 'hasAdminAccess',
  get: async ({ get }) => {
    const user = get(userSelector)
    return user?.admin === true || Object.keys(user?.roles ?? {}).length > 0
  },
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
})

export const adminUserOrgIdsSelector = selector({
  key: 'adminUserOrgIds',
  get: async ({ get }) => {
    const user = get(userSelector)
    const roles = user?.roles ?? {}

    return Object.keys(roles)
  },
})
