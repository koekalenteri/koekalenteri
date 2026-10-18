import type { UseAuthenticator } from '@aws-amplify/ui-react'
import { I18n } from '@aws-amplify/core'
import { Authenticator } from '@aws-amplify/ui-react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { fiAuthenticationDict } from '../../i18n/locales/fi/auth'
import { HiddenPageTitle } from '../components/HiddenPageTitle'
import { authenticatorComponents } from './AuthenticatorHeaders'

import '@aws-amplify/ui-react/styles.css'

// Only a real sign-up fills where Cognito sent the code; without it the sign-up header reads "We Texted You".
const codeDeliveryDetails: UseAuthenticator['codeDeliveryDetails'] = {
  AttributeName: 'email',
  DeliveryMedium: 'EMAIL',
  Destination: 'h***@e***',
}
vi.mock(import('@aws-amplify/ui-react'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    useAuthenticator: (selector) => ({ ...original.useAuthenticator(selector), codeDeliveryDetails }),
  }
})

// The app reads Amplify's texts in Finnish from this vocabulary (src/i18n); a capture shows the same.
beforeAll(() => {
  I18n.putVocabularies({ fi: fiAuthenticationDict })
  I18n.setLanguage('fi')
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
      <Authenticator.Provider>
        <HiddenPageTitle>Kirjaudu</HiddenPageTitle>
        <Header />
      </Authenticator.Provider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { level: 2 })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot(`authenticator-header-${name}`)
})
