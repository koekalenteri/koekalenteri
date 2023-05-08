import { Auth } from '@aws-amplify/auth'
import { selector } from 'recoil'

import { userAtom } from './atoms'

export const userNameSelector = selector({
  key: 'userName',
  get: async () => {
    try {
      const user = await Auth.currentAuthenticatedUser()
      return user?.attributes?.name || user?.attributes?.email
    } catch (e) {
      // The user is not authenticated
    }
  },
})

export const accessTokenSelector = selector({
  key: 'accessToken',
  get: async () => {
    try {
      const user = await Auth.currentAuthenticatedUser()
      return user?.getSignInUserSession()?.getAccessToken().getJwtToken()
    } catch (e) {
      // The user is not authenticated
    }
  },
})

export const idTokenSelector = selector({
  key: 'idToken',
  get: async () => {
    try {
      const user = await Auth.currentAuthenticatedUser()
      return user?.getSignInUserSession()?.getIdToken().getJwtToken()
    } catch (e) {
      // The user is not authenticated
    }
  },
})

export const isAdminSelector = selector({
  key: 'isAdmin',
  get: async ({ get }) => {
    const user = get(userAtom)
    return user?.admin === true
  },
})

export const isOrgAdminSelector = selector({
  key: 'isOrgAdmin',
  get: async ({ get }) => {
    const user = get(userAtom)
    const roles = user?.roles ?? {}
    return user?.admin === true || Object.keys(roles).some((key) => roles[key] === 'admin')
  },
})

export const hasAdminAccessSelector = selector({
  key: 'hasAdminAccess',
  get: async ({ get }) => {
    const user = get(userAtom)
    return user?.admin === true || Object.keys(user?.roles ?? {}).length > 0
  },
})
