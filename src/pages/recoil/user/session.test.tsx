import type React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { reportError } from '../../../lib/client/error'
import { idTokenAtom } from './atoms'
import { getJwtExpiresAt, isInvalidAuthSessionError, useAuthSessionRefresh } from './session'

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}))

jest.mock('../../../lib/client/error', () => ({
  reportError: jest.fn(),
}))

const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

const makeToken = (payload: object) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

describe('auth session refresh', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-29T12:00:00.000Z'))
    jest.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('reads JWT expiration time', () => {
    const token = makeToken({ exp: 1_782_733_200 })

    expect(getJwtExpiresAt(token)).toBe(1_782_733_200_000)
  })

  it.each([
    'NotAuthorizedException',
    'UserUnAuthenticatedException',
    'RefreshTokenReuseException',
  ])('treats %s as an invalid auth session', (name) => {
    expect(isInvalidAuthSessionError({ name })).toBe(true)
  })

  it('does not treat transient errors as invalid auth sessions', () => {
    expect(isInvalidAuthSessionError(new TypeError('Failed to fetch'))).toBe(false)
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
    ;(fetchAuthSession as jest.Mock).mockRejectedValueOnce({ name: 'NotAuthorizedException' })

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
    expect(reportError).not.toHaveBeenCalled()
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
    expect(reportError).toHaveBeenCalledWith(error)
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
  })
})
