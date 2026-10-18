import type { UseAuthenticator } from '@aws-amplify/ui-react'
import { Authenticator } from '@aws-amplify/ui-react'
import { render, screen } from '@testing-library/react'
import { flushPromises } from '../../test-utils/utils'
import { authenticatorComponents } from './authenticatorHeaders'

// Where Cognito sent the sign-up code lives in the auth machine's context, which only a real sign-up
// fills; the test sets it, and without it Amplify's own header would read "We Texted You".
let codeDeliveryDetails: UseAuthenticator['codeDeliveryDetails'] | undefined
vi.mock(import('@aws-amplify/ui-react'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    useAuthenticator: (selector) => {
      const real = original.useAuthenticator(selector)
      return codeDeliveryDetails ? { ...real, codeDeliveryDetails } : real
    },
  }
})

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
  afterEach(() => {
    codeDeliveryDetails = undefined
  })

  it.each([
    ['ConfirmResetPassword', 'Vaihda salasana', 3],
    ['ConfirmSignUp', 'Lähetimme sinulle sähköpostia', 4],
    ['ConfirmVerifyUser', 'Account recovery requires verified contact information', 3],
    ['ForceNewPassword', 'Vaihda salasana', 4],
    ['ForgotPassword', 'Vaihda salasana', 3],
    ['VerifyUser', 'Account recovery requires verified contact information', 3],
  ] as const)(
    'heads %s one level below the page h1, drawn at the level Amplify uses',
    async (route, text, amplifyLevel) => {
      codeDeliveryDetails = { AttributeName: 'email', DeliveryMedium: 'EMAIL', Destination: 'h***@e***' }
      await renderHeader(route)

      const heading = screen.getByRole('heading', { level: 2, name: text })
      expect(heading.style.fontSize).toBe(`var(--amplify-components-heading-${amplifyLevel}-font-size)`)
      expect(heading.style.fontWeight).toBe(`var(--amplify-components-heading-${amplifyLevel}-font-weight)`)
    }
  )
})
