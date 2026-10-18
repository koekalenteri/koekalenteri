import type { TestStore } from 'test-utils/AtomProvider'
import type { passwordFormFields } from './loginPage/passwordFormFields'
import { I18n } from '@aws-amplify/core'
import { act, render, screen, waitFor } from '@testing-library/react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { StrictMode, Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { fiAuthenticationDict } from '../i18n/locales/fi/auth'
import { reportError } from '../lib/client/error'
import { Component as LoginPage } from './LoginPage'
import { idTokenAtom, languageAtom } from './state'

const mockSignIn = vi.fn()

interface AuthenticatorStubProps {
  readonly formFields: ReturnType<typeof passwordFormFields>
}

vi.mock('@aws-amplify/ui-react', () => ({
  // The label the page hands Amplify for the sign-in password's show-password switch.
  Authenticator: ({ formFields }: AuthenticatorStubProps) => (
    <div>AUTHENTICATOR {formFields.signIn?.password.showPasswordButtonLabel}</div>
  ),
  useAuthenticator: () => ({ route: 'authenticated' }),
}))

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(() => Promise.resolve({})),
}))

vi.mock('../lib/client/error', () => ({
  reportError: vi.fn(),
}))

vi.mock('./components/Header', () => ({ default: () => <div>HEADER</div> }))

vi.mock('./state/user/actions', () => ({
  useUserActions: () => ({
    signIn: (token: string) => mockSignIn(token),
  }),
}))

const authSession = (token: string) =>
  ({
    tokens: {
      idToken: {
        toString: () => token,
      },
    },
  }) as Awaited<ReturnType<typeof fetchAuthSession>>

const renderLoginPage = (idToken?: string) =>
  render(
    <Provider initializeState={({ set }) => set(idTokenAtom, idToken)}>
      <Suspense fallback={<div>loading</div>}>
        <LoginPage />
      </Suspense>
    </Provider>
  )

describe('LoginPage', () => {
  const mockFetchAuthSession = fetchAuthSession as import('vitest').MockedFunction<typeof fetchAuthSession>
  const mockReportError = reportError as import('vitest').MockedFunction<typeof reportError>

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('does not call signIn repeatedly while Cognito remains authenticated', async () => {
    mockFetchAuthSession.mockResolvedValue(authSession('id-token'))

    const { rerender } = renderLoginPage()

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1))

    rerender(
      <Provider initializeState={({ set }) => set(idTokenAtom, undefined)}>
        <Suspense fallback={<div>loading</div>}>
          <LoginPage />
        </Suspense>
      </Provider>
    )

    expect(mockFetchAuthSession).toHaveBeenCalledTimes(1)
    expect(mockSignIn).toHaveBeenCalledTimes(1)
    expect(mockSignIn).toHaveBeenCalledWith('id-token')
  })

  it('completes sign in when the fetched token is already current after an OAuth redirect', async () => {
    mockFetchAuthSession.mockResolvedValue(authSession('id-token'))

    renderLoginPage('id-token')

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('id-token'))
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })

  it('completes sign in when the OAuth callback effect is restarted in Strict Mode', async () => {
    mockFetchAuthSession.mockResolvedValue(authSession('id-token'))

    render(
      <StrictMode>
        <Provider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
          <Suspense fallback={<div>loading</div>}>
            <LoginPage />
          </Suspense>
        </Provider>
      </StrictMode>
    )

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('id-token'))
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })

  it('labels the password switch in the language the page switches to', async () => {
    I18n.putVocabularies({ fi: fiAuthenticationDict })
    let store: TestStore | undefined
    render(
      <Provider
        initializeState={(initial) => {
          store = initial
          initial.set(languageAtom, 'fi')
        }}
      >
        <Suspense fallback={<div>loading</div>}>
          <LoginPage />
        </Suspense>
      </Provider>
    )

    expect(await screen.findByText('AUTHENTICATOR Näytä salasana')).toBeInTheDocument()

    act(() => store?.set(languageAtom, 'en'))

    expect(await screen.findByText('AUTHENTICATOR Show password')).toBeInTheDocument()
  })

  it('names the page in an h1', async () => {
    renderLoginPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'login' })).toBeInTheDocument()
  })

  it('reports auth session lookup failures', async () => {
    const error = new Error('temporary auth session failure')
    mockFetchAuthSession.mockRejectedValueOnce(error)

    renderLoginPage()

    await waitFor(() => expect(mockReportError).toHaveBeenCalledWith(error))
    expect(mockSignIn).not.toHaveBeenCalled()
  })
})
