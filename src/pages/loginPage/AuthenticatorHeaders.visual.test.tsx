import { I18n } from '@aws-amplify/core'
import { Authenticator } from '@aws-amplify/ui-react'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { fiAuthenticationDict } from '../../i18n/locales/fi/auth'
import { HiddenPageTitle } from '../components/HiddenPageTitle'
import { authenticatorComponents } from './AuthenticatorHeaders'
import { emailCodeDelivery, setCodeDelivery } from './authenticatorFixtures'

import '@aws-amplify/ui-react/styles.css'

vi.mock(import('@aws-amplify/ui-react'), async (importOriginal) => {
  const original = await importOriginal()
  const { withCodeDelivery } = await import('./authenticatorFixtures')
  return { ...original, useAuthenticator: withCodeDelivery(original.useAuthenticator) }
})

// The app reads Amplify's texts in Finnish from this vocabulary (src/i18n); a capture shows the same.
beforeAll(() => {
  I18n.putVocabularies({ fi: fiAuthenticationDict })
  I18n.setLanguage('fi')
  setCodeDelivery(emailCodeDelivery)
})

it.each([
  ['ConfirmResetPassword', 'confirm-reset-password'],
  ['ConfirmSignUp', 'confirm-sign-up'],
  ['ConfirmVerifyUser', 'confirm-verify-user'],
  ['ForceNewPassword', 'force-new-password'],
  ['ForgotPassword', 'forgot-password'],
  ['VerifyUser', 'verify-user'],
] as const)('heads %s under the login page h1', async (route, name) => {
  const { Header } = authenticatorComponents[route]
  await page.viewport(480, 200)
  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 448 }}>
      <ThemeProvider theme={theme}>
        <Authenticator.Provider>
          <HiddenPageTitle>Kirjaudu</HiddenPageTitle>
          <Header />
        </Authenticator.Provider>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { level: 2 })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot(`authenticator-header-${name}`)
})
