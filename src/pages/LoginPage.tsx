import { useEffect } from 'react'
import { I18n } from '@aws-amplify/core'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import Box from '@mui/material/Box'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useRecoilValue } from 'recoil'

import Header from './components/Header'
import { useUserActions } from './recoil/user/actions'
import { languageAtom } from './recoil'

import '@aws-amplify/ui-react/styles.css'

export function Component() {
  const { route } = useAuthenticator((context) => [context.route])
  const actions = useUserActions()
  const language = useRecoilValue(languageAtom)

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

  useEffect(() => {
    I18n.setLanguage(language)
  }, [language])

  return (
    <>
      <Header />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          minHeight: '100vh',
          backgroundColor: 'background.default',
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
