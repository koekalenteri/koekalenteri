import type React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { reportError } from '../lib/client/error'
import { idTokenAtom } from '../pages/recoil/user/atoms'
import { validIdTokenSelector } from '../pages/recoil/user/selectors'
import { useAuthSessionRefresh } from './useAuthSessionRefresh'

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(() => Promise.resolve({})),
}))

jest.mock('../lib/client/error', () => ({
  reportError: jest.fn(),
}))

const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

const makeToken = (payload: object) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

describe('auth session refresh', () => {
  const mockReportError = reportError as jest.MockedFunction<typeof reportError>
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-29T12:00:00.000Z'))
    jest.clearAllMocks()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    localStorage.clear()
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    jest.useRealTimers()
  })

  it('does nothing without an id token', () => {
    renderHook(() => useAuthSessionRefresh(undefined), { wrapper: RecoilRoot })

    jest.runOnlyPendingTimers()

    expect(fetchAuthSession).not.toHaveBeenCalled()
  })

  it('refreshes the id token before it expires', async () => {
    const currentToken = makeToken({ exp: Date.now() / 1000 + 120 })
    const freshToken = makeToken({ exp: Date.now() / 1000 + 3600 })
    ;(fetchAuthSession as jest.Mock).mockResolvedValueOnce({
      tokens: { idToken: { toString: () => freshToken } },
    })

    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, currentToken)}>{children}</RecoilRoot>
    )

    const { result } = renderHook(
      () => {
        const token = useRecoilValue(idTokenAtom)
        useAuthSessionRefresh(token)
        return token
      },
      { wrapper }
    )

    expect(result.current).toBe(currentToken)
    expect(fetchAuthSession).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    expect(fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true })
    expect(result.current).toBe(freshToken)
  })

  it('clears the id token when refresh fails because the auth session is invalid', async () => {
    const currentToken = makeToken({ exp: Date.now() / 1000 + 120 })
    const error = { name: 'NotAuthorizedException' }
    ;(fetchAuthSession as jest.Mock).mockRejectedValueOnce(error)

    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, currentToken)}>{children}</RecoilRoot>
    )

    const { result } = renderHook(
      () => {
        const token = useRecoilValue(idTokenAtom)
        useAuthSessionRefresh(token)
        return token
      },
      { wrapper }
    )

    await act(async () => {
      jest.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current).toBeUndefined())
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'auth: session is no longer refreshable',
      expect.objectContaining({ durationMs: expect.any(Number), error })
    )
    expect(mockReportError).not.toHaveBeenCalled()
  })

  it('keeps the id token when refresh fails transiently', async () => {
    const currentToken = makeToken({ exp: Date.now() / 1000 + 120 })
    const error = new TypeError('Failed to fetch')
    ;(fetchAuthSession as jest.Mock).mockRejectedValueOnce(error)

    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, currentToken)}>{children}</RecoilRoot>
    )

    const { result } = renderHook(
      () => {
        const token = useRecoilValue(idTokenAtom)
        useAuthSessionRefresh(token)
        return token
      },
      { wrapper }
    )

    await act(async () => {
      jest.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current).toBe(currentToken))
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'auth: session refresh failed transiently',
      expect.objectContaining({ durationMs: expect.any(Number), error })
    )
    expect(mockReportError).toHaveBeenCalledWith(error)
  })

  it('clears the id token when forced refresh returns no id token', async () => {
    const currentToken = makeToken({ exp: Date.now() / 1000 + 120 })
    ;(fetchAuthSession as jest.Mock).mockResolvedValueOnce({})

    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, currentToken)}>{children}</RecoilRoot>
    )

    const { result } = renderHook(
      () => {
        const token = useRecoilValue(idTokenAtom)
        useAuthSessionRefresh(token)
        return token
      },
      { wrapper }
    )

    await act(async () => {
      jest.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current).toBeUndefined())
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'auth: session refresh returned no id token',
      expect.objectContaining({ durationMs: expect.any(Number) })
    )
  })

  it('keeps an expired raw token while hiding it from authenticated consumers during refresh', async () => {
    const expiredToken = makeToken({ exp: Date.now() / 1000 - 1 })
    let resolveRefresh: (value: unknown) => void = () => undefined
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve
    })
    ;(fetchAuthSession as jest.Mock).mockReturnValueOnce(refreshPromise)

    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, expiredToken)}>{children}</RecoilRoot>
    )

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        const validToken = useRecoilValue(validIdTokenSelector)
        useAuthSessionRefresh(rawToken)
        return { rawToken, validToken }
      },
      { wrapper }
    )

    expect(result.current).toEqual({ rawToken: expiredToken, validToken: undefined })

    await act(async () => {
      jest.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true })
    expect(result.current).toEqual({ rawToken: expiredToken, validToken: undefined })

    await act(async () => {
      resolveRefresh({})
      await refreshPromise
    })
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'auth: session refresh returned no id token',
      expect.objectContaining({ durationMs: expect.any(Number) })
    )
  })

  it('invalidates the valid token when it expires after a transient refresh failure', async () => {
    const currentToken = makeToken({ exp: Date.now() / 1000 + 120 })
    const error = new TypeError('Failed to fetch')
    ;(fetchAuthSession as jest.Mock).mockRejectedValueOnce(error)

    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, currentToken)}>{children}</RecoilRoot>
    )

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        const validToken = useRecoilValue(validIdTokenSelector)
        useAuthSessionRefresh(rawToken)
        return { rawToken, validToken }
      },
      { wrapper }
    )

    await act(async () => {
      jest.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(result.current.validToken).toBe(currentToken)

    act(() => {
      jest.advanceTimersByTime(60_001)
    })

    expect(result.current).toEqual({ rawToken: currentToken, validToken: undefined })
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'auth: session refresh failed transiently',
      expect.objectContaining({ durationMs: expect.any(Number), error })
    )
  })

  it('rechecks token validity and refreshes when a background tab becomes visible', async () => {
    const currentToken = makeToken({ exp: Date.now() / 1000 + 30 })
    const freshToken = makeToken({ exp: Date.now() / 1000 + 3600 })
    ;(fetchAuthSession as jest.Mock).mockResolvedValueOnce({
      tokens: { idToken: { toString: () => freshToken } },
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, currentToken)}>{children}</RecoilRoot>
    )

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        useAuthSessionRefresh(rawToken)
        return useRecoilValue(validIdTokenSelector)
      },
      { wrapper }
    )

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true })
    expect(result.current).toBe(freshToken)
  })

  it('does not invalidate auth state when a background tab returns with a valid token', async () => {
    const currentToken = makeToken({ exp: Date.now() / 1000 + 3600 })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, currentToken)}>{children}</RecoilRoot>
    )

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        useAuthSessionRefresh(rawToken)
        return useRecoilValue(validIdTokenSelector)
      },
      { wrapper }
    )
    const valueBeforeVisibilityChange = result.current

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(fetchAuthSession).not.toHaveBeenCalled()
    expect(result.current).toBe(valueBeforeVisibilityChange)
  })
})
