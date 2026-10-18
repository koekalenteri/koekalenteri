import type { AuthenticatorProps } from '@aws-amplify/ui-react'
import { I18n } from '@aws-amplify/core'
import { Authenticator } from '@aws-amplify/ui-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Amplify } from 'aws-amplify'
import { fiAuthenticationDict } from '../../i18n/locales/fi/auth'
import { flushPromises } from '../../test-utils/utils'
import { passwordFormFields } from './passwordFormFields'

type Services = NonNullable<AuthenticatorProps['services']>

const services: Services = {
  getCurrentUser: () => Promise.reject(new Error('signed out')),
  handleForgotPassword: () =>
    Promise.resolve({
      isPasswordReset: false,
      nextStep: {
        codeDeliveryDetails: { attributeName: 'email', deliveryMedium: 'EMAIL', destination: 'h***@e***' },
        resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE',
      },
    }),
  handleSignIn: () =>
    Promise.resolve({
      isSignedIn: false,
      nextStep: { missingAttributes: [], signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    }),
}

/** What a reader and the browser get from each field of the open form, in the order drawn. */
const drawnFields = () =>
  [...document.querySelectorAll('input')].map((input) => ({
    autocomplete: input.getAttribute('autocomplete'),
    label: input.labels?.[0]?.textContent,
    name: input.name,
    placeholder: input.placeholder,
    required: input.required,
    type: input.type,
  }))

const showPasswordLabels = () =>
  screen.queryAllByRole('switch').map((button) => [button.getAttribute('aria-label'), button.textContent])

const user = userEvent.setup()

/** Opens a route of the Authenticator, as a reader reaches it from the initial state. */
const routes = {
  confirmResetPassword: {
    heading: 'Uusi salasana',
    initialState: 'forgotPassword',
    reach: async () => {
      await user.type(await screen.findByLabelText('Kirjoita sähköpostiosoitteesi'), 'h@e.fi')
      await user.click(screen.getByRole('button', { name: 'Lähetä koodi sähköpostiin' }))
    },
  },
  forceNewPassword: {
    heading: 'Salasana uudelleen',
    initialState: 'signIn',
    reach: async () => {
      await user.type(await screen.findByLabelText('Sähköposti'), 'h@e.fi')
      await user.type(screen.getByLabelText('Salasana'), 'Salasana1')
      await user.click(screen.getByRole('button', { name: 'Kirjaudu' }))
    },
  },
  signIn: { heading: 'Salasana', initialState: 'signIn', reach: async () => {} },
  signUp: { heading: 'Salasana uudelleen', initialState: 'signUp', reach: async () => {} },
} as const

const openRoute = async (route: keyof typeof routes, formFields?: AuthenticatorProps['formFields']) => {
  const { heading, initialState, reach } = routes[route]
  const view = render(
    <Authenticator
      formFields={formFields}
      initialState={initialState}
      loginMechanisms={['email']}
      services={services}
      socialProviders={['google']}
    />
  )
  // The provider starts Amplify's auth machine, which settles after the first render.
  await flushPromises()
  await reach()
  await screen.findByLabelText(heading)
  await flushPromises()
  return view
}

describe('passwordFormFields', () => {
  beforeAll(() => {
    Amplify.configure({ Auth: { Cognito: { userPoolClientId: 'client', userPoolId: 'eu-north-1_pool' } } })
    I18n.putVocabularies({ fi: fiAuthenticationDict })
    I18n.setLanguage('fi')
  })

  afterAll(() => I18n.setLanguage('en'))

  it.each(['signIn', 'signUp', 'forceNewPassword', 'confirmResetPassword'] as const)(
    'keeps the fields Amplify draws on %s and names their password switch in Finnish',
    async (route) => {
      const amplify = await openRoute(route)
      const amplifyFields = drawnFields()
      expect(showPasswordLabels()).toContainEqual(['Show password', 'Password is hidden'])
      amplify.unmount()

      await openRoute(route, passwordFormFields())

      expect(drawnFields()).toEqual(amplifyFields)
      const labels = showPasswordLabels()
      expect(labels.length).toBeGreaterThan(0)
      expect(labels).toEqual(labels.map(() => ['Näytä salasana', 'Salasana on piilotettu']))
    }
  )

  it('announces a shown password in Finnish', async () => {
    await openRoute('signIn', passwordFormFields())

    await user.click(screen.getByRole('switch', { name: 'Näytä salasana' }))

    expect(screen.getByRole('switch', { name: 'Näytä salasana' })).toHaveTextContent('Salasana näkyy')
  })

  it('keeps the English labels in English', () => {
    I18n.setLanguage('en')

    expect(passwordFormFields().signIn?.password).toMatchObject({
      passwordIsHiddenLabel: 'Password is hidden',
      passwordIsShownLabel: 'Password is shown',
      showPasswordButtonLabel: 'Show password',
    })

    I18n.setLanguage('fi')
  })
})
