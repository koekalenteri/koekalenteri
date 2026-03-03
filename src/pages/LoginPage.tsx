import { I18n } from '@aws-amplify/core'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import Box from '@mui/material/Box'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useEffect } from 'react'
import { useRecoilValue } from 'recoil'
import Header from './components/Header'
import { languageAtom } from './recoil'
import { useUserActions } from './recoil/user/actions'

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
