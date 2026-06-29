import { I18n } from '@aws-amplify/core'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import Box from '@mui/material/Box'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useEffect, useRef } from 'react'
import { useRecoilValue } from 'recoil'
import Header from './components/Header'
import { idTokenAtom, languageAtom } from './recoil'
import { useUserActions } from './recoil/user/actions'

import '@aws-amplify/ui-react/styles.css'

export function Component() {
  const { route } = useAuthenticator((context) => [context.route])
  const { signIn } = useUserActions()
  const language = useRecoilValue(languageAtom)
  const idToken = useRecoilValue(idTokenAtom)
  const authenticatedHandledRef = useRef(false)

  useEffect(() => {
    if (route !== 'authenticated') {
      authenticatedHandledRef.current = false
      return
    }

    if (authenticatedHandledRef.current) return

    authenticatedHandledRef.current = true
    let cancelled = false

    fetchAuthSession().then((session) => {
      if (cancelled) return

      const token = session.tokens?.idToken?.toString()
      if (token && token !== idToken) {
        signIn(token)
      }
    })

    return () => {
      cancelled = true
    }
  }, [idToken, route, signIn])

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
