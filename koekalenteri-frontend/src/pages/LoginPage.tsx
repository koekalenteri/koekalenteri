import { useEffect } from 'react'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'

import { useUserActions } from './recoil/user/actions'

import '@aws-amplify/ui-react/styles.css'

export function LoginPage() {
  const { user, route } = useAuthenticator((context) => [context.user, context.route])
  const actions = useUserActions()

  useEffect(() => {
    if (route === 'authenticated') {
      const token = user.getSignInUserSession()?.getIdToken().getJwtToken()
      if (token) {
        actions.signIn(token)
      }
    }
  }, [actions, route, user])

  return <Authenticator socialProviders={['google' /*, 'facebook'*/]} loginMechanisms={['email']} />
}
