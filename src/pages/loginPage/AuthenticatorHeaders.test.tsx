import { Authenticator } from '@aws-amplify/ui-react'
import { render, screen } from '@testing-library/react'
import { flushPromises } from '../../test-utils/utils'
import { authenticatorComponents } from './AuthenticatorHeaders'
import { emailCodeDelivery, setCodeDelivery } from './authenticatorFixtures'

vi.mock(import('@aws-amplify/ui-react'), async (importOriginal) =>
  (await import('./authenticatorFixtures')).mockAuthenticatorModule(importOriginal)
)

const renderHeader = async (route: keyof typeof authenticatorComponents) => {
  const { Header } = authenticatorComponents[route]

  render(
    <Authenticator.Provider>
      <Header />
    </Authenticator.Provider>
  )
  // The provider starts Amplify's auth machine, which settles after the first render.
  await flushPromises()
}

describe('authenticatorComponents', () => {
  afterEach(() => setCodeDelivery(undefined))

  it.each([
    ['ConfirmResetPassword', 'Vaihda salasana', 3],
    ['ConfirmSignUp', 'Lähetimme sinulle sähköpostia', 4],
    ['ConfirmVerifyUser', 'Tilin palauttaminen vaatii vahvistetun yhteystiedon', 3],
    ['ForceNewPassword', 'Vaihda salasana', 4],
    ['ForgotPassword', 'Vaihda salasana', 3],
    ['VerifyUser', 'Tilin palauttaminen vaatii vahvistetun yhteystiedon', 3],
  ] as const)(
    'heads %s one level below the page h1, drawn at the level Amplify uses',
    async (route, text, amplifyLevel) => {
      setCodeDelivery(emailCodeDelivery)
      await renderHeader(route)

      const heading = screen.getByRole('heading', { level: 2, name: text })
      expect(heading.style.fontSize).toBe(`var(--amplify-components-heading-${amplifyLevel}-font-size)`)
      expect(heading.style.fontWeight).toBe(`var(--amplify-components-heading-${amplifyLevel}-font-weight)`)
    }
  )
})
