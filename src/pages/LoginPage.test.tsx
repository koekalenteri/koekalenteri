import { render, waitFor } from '@testing-library/react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { StrictMode, Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { reportError } from '../lib/client/error'
import { Component as LoginPage } from './LoginPage'
import { idTokenAtom } from './recoil'

const mockSignIn = jest.fn()

jest.mock('@aws-amplify/core', () => ({
  I18n: {
    setLanguage: jest.fn(),
  },
}))

jest.mock('@aws-amplify/ui-react', () => ({
  Authenticator: () => <div>AUTHENTICATOR</div>,
  useAuthenticator: () => ({ route: 'authenticated' }),
}))

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(() => Promise.resolve({})),
}))

jest.mock('../lib/client/error', () => ({
  reportError: jest.fn(),
}))

jest.mock('./components/Header', () => () => <div>HEADER</div>)

jest.mock('./recoil/user/actions', () => ({
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
    <RecoilRoot initializeState={({ set }) => set(idTokenAtom, idToken)}>
      <Suspense fallback={<div>loading</div>}>
        <LoginPage />
      </Suspense>
    </RecoilRoot>
  )

describe('LoginPage', () => {
  const mockFetchAuthSession = fetchAuthSession as jest.MockedFunction<typeof fetchAuthSession>
  const mockReportError = reportError as jest.MockedFunction<typeof reportError>

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  it('does not call signIn repeatedly while Cognito remains authenticated', async () => {
    mockFetchAuthSession.mockResolvedValue(authSession('id-token'))

    const { rerender } = renderLoginPage()

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1))

    rerender(
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, undefined)}>
        <Suspense fallback={<div>loading</div>}>
          <LoginPage />
        </Suspense>
      </RecoilRoot>
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
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
          <Suspense fallback={<div>loading</div>}>
            <LoginPage />
          </Suspense>
        </RecoilRoot>
      </StrictMode>
    )

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('id-token'))
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })

  it('reports auth session lookup failures', async () => {
    const error = new Error('temporary auth session failure')
    mockFetchAuthSession.mockRejectedValueOnce(error)

    renderLoginPage()

    await waitFor(() => expect(mockReportError).toHaveBeenCalledWith(error))
    expect(mockSignIn).not.toHaveBeenCalled()
  })
})
