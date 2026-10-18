import type { AuthenticatorProps } from '@aws-amplify/ui-react'
import { I18n } from '@aws-amplify/core'
import { Authenticator } from '@aws-amplify/ui-react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Amplify } from 'aws-amplify'
import { AWSConfig } from '../../amplify-env'
import { fiAuthenticationDict } from '../../i18n/locales/fi/auth'
import { flushPromises } from '../../test-utils/utils'

/** Where Cognito says a code went: by email, as this user pool sends it. */
const codeDeliveryDetails = { attributeName: 'email', deliveryMedium: 'EMAIL', destination: 'h***@e***' } as const

/** Cognito's answers, so each route can be reached without a user pool. */
const services: NonNullable<AuthenticatorProps['services']> = {
  getCurrentUser: () => Promise.reject(new Error('signed out')),
  handleForgotPassword: () =>
    Promise.resolve({
      isPasswordReset: false,
      nextStep: { codeDeliveryDetails, resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE' },
    }),
  handleSignIn: () =>
    Promise.resolve({
      isSignedIn: false,
      nextStep: { missingAttributes: [], signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    }),
  handleSignUp: () =>
    Promise.resolve({
      isSignUpComplete: false,
      nextStep: { codeDeliveryDetails, signUpStep: 'CONFIRM_SIGN_UP' },
      userId: 'user',
    }),
}

export const user = userEvent.setup()

/**
 * The Authenticator in Finnish, with the app's Amplify configuration of the user pool's password policy
 * (`passwordFormat`). Call inside a describe; each test starts in Finnish.
 */
export const setUpAuthenticator = () => {
  beforeAll(() => {
    Amplify.configure({
      Auth: {
        Cognito: {
          passwordFormat: AWSConfig.Auth?.Cognito.passwordFormat,
          userPoolClientId: 'client',
          userPoolId: 'eu-north-1_pool',
        },
      },
    })
    I18n.putVocabularies({ fi: fiAuthenticationDict })
  })
  beforeEach(() => I18n.setLanguage('fi'))
  afterAll(() => I18n.setLanguage('en'))
}

/** How a reader reaches each route from the Authenticator's initial state, and a field it then shows. */
const routes = {
  confirmResetPassword: {
    field: 'Uusi salasana',
    initialState: 'forgotPassword',
    reach: async () => {
      await user.type(await screen.findByLabelText('Kirjoita sähköpostiosoitteesi'), 'h@e.fi')
      await user.click(screen.getByRole('button', { name: 'Lähetä koodi sähköpostiin' }))
    },
  },
  confirmSignUp: {
    field: 'Vahvistuskoodi',
    initialState: 'signUp',
    reach: async () => {
      await user.type(await screen.findByLabelText('Sähköposti'), 'h@e.fi')
      await user.type(screen.getByLabelText('Salasana'), 'Salasana1')
      const confirm = screen.getByLabelText('Salasana uudelleen')
      await user.type(confirm, 'Salasana1')
      // The submit button's own handler reaches for the form's named elements, which jsdom does not
      // provide, so the form is submitted directly.
      fireEvent.submit(confirm.closest('form') ?? confirm)
    },
  },
  forceNewPassword: {
    field: 'Salasana uudelleen',
    initialState: 'signIn',
    reach: async () => {
      await user.type(await screen.findByLabelText('Sähköposti'), 'h@e.fi')
      await user.type(screen.getByLabelText('Salasana'), 'Salasana1')
      await user.click(screen.getByRole('button', { name: 'Kirjaudu' }))
    },
  },
  signIn: { field: 'Salasana', initialState: 'signIn', reach: async () => {} },
  signUp: { field: 'Salasana uudelleen', initialState: 'signUp', reach: async () => {} },
} as const

/** Renders the Authenticator as the login page configures it and opens `route`. */
export const openRoute = async (route: keyof typeof routes, formFields?: AuthenticatorProps['formFields']) => {
  const { field, initialState, reach } = routes[route]
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
  await screen.findByLabelText(field)
  await flushPromises()
  return view
}
