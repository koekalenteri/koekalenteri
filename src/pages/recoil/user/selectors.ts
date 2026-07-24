import { selector } from 'recoil'
import { getCurrentUser } from '../../../lib/client/currentUser'
import { reportError } from '../../../lib/client/error'
import { isValidIdToken } from '../../../lib/token'
import { userHasAdminAccess } from '../../../lib/user'
import { idTokenAtom, tokenValidityRevisionAtom, userRefreshAtom } from './atoms'

export const validIdTokenSelector = selector<string | undefined>({
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
  get: ({ get }) => {
    get(tokenValidityRevisionAtom)

    const token = get(idTokenAtom)
    if (!token) return undefined

    return isValidIdToken(token) ? token : undefined
  },
  key: 'idToken/valid',
})

export const userSelector = selector({
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
  get: async ({ get }) => {
    const token = get(validIdTokenSelector)
    const refresh = get(userRefreshAtom)
    if (!token) return null

    try {
      const user = await getCurrentUser(token, refresh)
      return user
    } catch (e) {
      reportError(e)
    }

    return null
  },
  key: 'user',
})

export const isAdminSelector = selector({
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
  get: async ({ get }) => {
    const user = get(userSelector)
    return user?.admin === true
  },
  key: 'isAdmin',
})

export const isOrgAdminSelector = selector({
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
  get: async ({ get }) => {
    const user = get(userSelector)
    const roles = user?.roles ?? {}
    return user?.admin === true || Object.keys(roles).some((key) => roles[key] === 'admin')
  },
  key: 'isOrgAdmin',
})

export const hasAdminAccessSelector = selector({
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
  get: async ({ get }) => {
    const user = get(userSelector)
    return userHasAdminAccess(user)
  },
  key: 'hasAdminAccess',
})

export const adminUserOrgIdsSelector = selector({
  get: async ({ get }) => {
    const user = get(userSelector)
    const roles = user?.roles ?? {}

    return Object.keys(roles)
  },
  key: 'adminUserOrgIds',
})
