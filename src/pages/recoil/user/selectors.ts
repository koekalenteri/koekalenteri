import { Auth } from '@aws-amplify/auth'
import { selector } from 'recoil'

import { getUser } from '../../../api/user'

import { idTokenAtom } from './atoms'

export const userSelector = selector({
  key: 'user',
  get: async ({ get }) => {
    try {
      const token = get(idTokenAtom)
      return token ? await getUser(token) : null
    } catch (e) {
      console.error(e)
    }

    return null
  },
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
})

export const accessTokenSelector = selector({
  key: 'accessToken',
  get: async () => {
    try {
      const user = await Auth.currentAuthenticatedUser()
      return user?.getSignInUserSession()?.getAccessToken().getJwtToken()
    } catch (e) {
      if (e !== 'The user is not authenticated') {
        console.error(e, typeof e)
      }
    }
  },
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
