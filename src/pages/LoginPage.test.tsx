import { render, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { Component as LoginPage } from './LoginPage'
import { idTokenAtom } from './recoil'

const mockFetchAuthSession = jest.fn()
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
  fetchAuthSession: () => mockFetchAuthSession(),
}))

jest.mock('./components/Header', () => () => <div>HEADER</div>)

jest.mock('./recoil/user/actions', () => ({
  useUserActions: () => ({
    signIn: (token: string) => mockSignIn(token),
  }),
}))

const authSession = (token: string) => ({
  tokens: {
    idToken: {
      toString: () => token,
    },
  },
})

const renderLoginPage = (idToken?: string) =>
  render(
    <RecoilRoot initializeState={({ set }) => set(idTokenAtom, idToken)}>
      <Suspense fallback={<div>loading</div>}>
        <LoginPage />
      </Suspense>
    </RecoilRoot>
  )

describe('LoginPage', () => {
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

  it('does not call signIn when the fetched token is already current', async () => {
    mockFetchAuthSession.mockResolvedValue(authSession('id-token'))

    renderLoginPage('id-token')

    await waitFor(() => expect(mockFetchAuthSession).toHaveBeenCalledTimes(1))

    expect(mockSignIn).not.toHaveBeenCalled()
  })
})
