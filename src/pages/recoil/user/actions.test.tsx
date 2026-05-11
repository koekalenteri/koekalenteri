import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import * as auth from 'aws-amplify/auth'
import { SnackbarProvider } from 'notistack'
import { MemoryRouter, Route, Routes } from 'react-router'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { useUserActions } from './actions'
import { idTokenAtom } from './atoms'

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: async () => ({ tokens: { idToken: { toString: () => 'id-token' } } }),
  signOut: jest.fn(),
}))

function wrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <RecoilRoot initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
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

  it('clears the id token only after aws sign out resolves', async () => {
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

    expect(result.current.token).toBe('id-token')

    await act(async () => {
      resolveSignOut?.()
    })

    await signOutPromise

    expect(result.current.token).toBeUndefined()
    expect(sessionStorage.getItem('loginPath')).toBeNull()
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
})
