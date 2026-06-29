import type React from 'react'
import { act, renderHook } from '@testing-library/react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { idTokenAtom } from './atoms'
import { getJwtExpiresAt, useAuthSessionRefresh } from './session'

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
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('reads JWT expiration time', () => {
    const token = makeToken({ exp: 1_782_733_200 })

    expect(getJwtExpiresAt(token)).toBe(1_782_733_200_000)
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
})
