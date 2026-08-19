import { I18n } from '@aws-amplify/core'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import Box from '@mui/material/Box'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useAtomValue } from 'jotai'
import { useEffect, useRef } from 'react'
import { reportError } from '../lib/client/error'
import Header from './components/Header'
import { languageAtom } from './state'
import { useUserActions } from './state/user/actions'

import '@aws-amplify/ui-react/styles.css'

export function Component() {
  const { route } = useAuthenticator((context) => [context.route])
  const { signIn } = useUserActions()
  const language = useAtomValue(languageAtom)
  const authenticatedHandledRef = useRef(false)

  useEffect(() => {
    if (route !== 'authenticated') {
      authenticatedHandledRef.current = false
      return
    }

    if (authenticatedHandledRef.current) return

    let cancelled = false

    fetchAuthSession()
      .then(async (session) => {
        if (cancelled) return

        const token = session.tokens?.idToken?.toString()
        if (token) {
          authenticatedHandledRef.current = true
          try {
            await signIn(token)
          } catch (error: unknown) {
            authenticatedHandledRef.current = false
            reportError(error)
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) reportError(error)
      })

    return () => {
      cancelled = true
    }
  }, [route, signIn])

  useEffect(() => {
    I18n.setLanguage(language)
  }, [language])

  return (
    <>
      <Header />
      <Box
        sx={{
          alignItems: 'center',
          backgroundColor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <Authenticator
          key={`authenticator-${language}`}
          socialProviders={['google' /*, 'facebook'*/]}
          loginMechanisms={['email']}
        />
      </Box>
    </>
  )
}

Component.displayName = 'LoginPage'
