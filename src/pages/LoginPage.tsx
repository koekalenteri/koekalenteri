import { useEffect } from 'react'
import { fetchAuthSession } from '@aws-amplify/auth'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'

import { useUserActions } from './recoil/user/actions'

import '@aws-amplify/ui-react/styles.css'

export function LoginPage() {
  const { route } = useAuthenticator((context) => [context.route])
  const actions = useUserActions()

  useEffect(() => {
    if (route === 'authenticated') {
      fetchAuthSession().then((session) => {
        const token = session.tokens?.idToken?.toString()
        if (token) {
          actions.signIn(token)
        }
      })
    }
  }, [actions, route])

  return <Authenticator socialProviders={['google' /*, 'facebook'*/]} loginMechanisms={['email']} />
}
