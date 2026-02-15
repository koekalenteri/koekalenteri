import { useEffect, useRef } from 'react'

import { useAuth } from '../auth/AuthProvider'

import LoadingIndicator from './components/LoadingIndicator'
import { useUserActions } from './recoil/user/actions'

export function Component() {
  const { isAuthenticated, isLoading, getAccessToken, login } = useAuth()
  const actions = useUserActions()
  const loginTriggeredRef = useRef(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      getAccessToken().then((token) => {
        if (token) actions.signIn(token)
      })
    }
  }, [actions, getAccessToken, isAuthenticated, isLoading])

  useEffect(() => {
    if (isLoading || isAuthenticated) return
    if (loginTriggeredRef.current) return
    loginTriggeredRef.current = true
    // Direct redirect to the Auth0 Universal Login.
    // No local "form" UX: the secure login screen is the only experience.
    login()
  }, [isAuthenticated, isLoading, login])

  return <LoadingIndicator />
}

Component.displayName = 'LoginPage'
