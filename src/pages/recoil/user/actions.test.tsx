import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import * as auth from 'aws-amplify/auth'
import { SnackbarProvider } from 'notistack'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { RecoilRoot, useRecoilValue } from 'recoil'
import * as userAPI from '../../../api/user'
import { Path } from '../../../routeConfig'
import { TEST_ID_TOKEN } from '../../../test-utils/utils'
import { useUserActions } from './actions'
import { idTokenAtom } from './atoms'

const NEW_TEST_ID_TOKEN = 'header.eyJleHAiOjQxMDI0NDQ4MDB9.updated-signature'
const FAILED_USER_TEST_ID_TOKEN = 'header.eyJleHAiOjQxMDI0NDQ4MDB9.failed-user-signature'

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: async () => ({ tokens: { idToken: { toString: () => 'id-token' } } }),
  signOut: jest.fn(),
}))

function wrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/current-page']}>
          <Routes>
            <Route path="/" element={children} />
            <Route path="/current-page" element={children} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </RecoilRoot>
  )
}

describe('useUserActions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    sessionStorage.setItem('loginPath', JSON.stringify('/current-page'))
    ;(auth.signOut as jest.Mock).mockResolvedValue(undefined)
  })

  it('clears the local session immediately while aws sign out completes', async () => {
    let resolveSignOut: (() => void) | undefined
    ;(auth.signOut as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve
        })
    )

    const { result } = renderHook(() => ({ actions: useUserActions(), token: useRecoilValue(idTokenAtom) }), {
      wrapper,
    })

    let signOutPromise: Promise<void> | undefined

    await act(async () => {
      signOutPromise = result.current.actions.signOut(false)
    })

    expect(result.current.token).toBeUndefined()
    expect(sessionStorage.getItem('loginPath')).toBeNull()

    await act(async () => {
      resolveSignOut?.()
    })

    await signOutPromise

    expect(result.current.token).toBeUndefined()
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('navigates to home after sign out completes', async () => {
    const { result } = renderHook(() => ({ actions: useUserActions(), token: useRecoilValue(idTokenAtom) }), {
      wrapper,
    })

    await act(async () => {
      await result.current.actions.signOut(false)
    })

    expect(result.current.token).toBeUndefined()
  })

  it('loads the signed-in user with the new token instead of the callback snapshot token', async () => {
    const getUserSpy = jest.spyOn(userAPI, 'getUser').mockResolvedValue({
      admin: false,
      email: 'new@example.com',
      id: 'user-1',
      name: 'New User',
      roles: {},
    })

    const { result } = renderHook(() => ({ actions: useUserActions(), token: useRecoilValue(idTokenAtom) }), {
      wrapper,
    })

    await act(async () => {
      await result.current.actions.signIn(NEW_TEST_ID_TOKEN)
    })

    expect(result.current.token).toBe(NEW_TEST_ID_TOKEN)
    expect(getUserSpy).toHaveBeenCalledWith(NEW_TEST_ID_TOKEN, undefined, 0)
    expect(getUserSpy).not.toHaveBeenCalledWith(TEST_ID_TOKEN, expect.anything(), expect.anything())
  })

  it('does not navigate back to the login page after sign in', async () => {
    jest.spyOn(userAPI, 'getUser').mockResolvedValue({
      admin: false,
      email: 'new@example.com',
      id: 'user-1',
      name: 'New User',
      roles: {},
    })
    sessionStorage.setItem('loginPath', JSON.stringify(Path.login))

    const { result } = renderHook(
      () => ({ actions: useUserActions(), location: useLocation(), token: useRecoilValue(idTokenAtom) }),
      { wrapper }
    )

    await act(async () => {
      await result.current.actions.signIn(NEW_TEST_ID_TOKEN)
    })

    expect(result.current.location.pathname).toBe(Path.home)
    expect(sessionStorage.getItem('loginPath')).toBeNull()
  })

  it('navigates away from login even when loading the user fails', async () => {
    const error = new Error('user lookup failed')
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(userAPI, 'getUser').mockRejectedValueOnce(error)
    sessionStorage.setItem('loginPath', JSON.stringify(Path.login))

    const { result } = renderHook(
      () => ({ actions: useUserActions(), location: useLocation(), token: useRecoilValue(idTokenAtom) }),
      { wrapper }
    )

    await act(async () => {
      await result.current.actions.signIn(FAILED_USER_TEST_ID_TOKEN)
    })

    expect(result.current.location.pathname).toBe(Path.home)
    expect(sessionStorage.getItem('loginPath')).toBeNull()
    expect(consoleWarn).toHaveBeenCalledWith(
      'auth: /user request failed',
      expect.objectContaining({ error, refresh: 0 })
    )
    expect(consoleError).toHaveBeenCalledWith('reportError', error)

    consoleWarn.mockRestore()
    consoleError.mockRestore()
  })
})
