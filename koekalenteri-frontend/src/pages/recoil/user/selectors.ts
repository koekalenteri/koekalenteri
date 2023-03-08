import { Auth } from '@aws-amplify/auth'
import { selector } from 'recoil'

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
  key: 'token',
  get: async () => {
    try {
      const user = await Auth.currentAuthenticatedUser()
      return user?.getSignInUserSession()?.getAccessToken().getJwtToken()
    } catch (e) {
      // The user is not authenticated
    }
  },
})
