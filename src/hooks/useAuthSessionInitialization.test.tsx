import type React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { StrictMode } from 'react'
import { RecoilRoot, useRecoilValue } from 'recoil'
import { reportError } from '../lib/client/error'
import { idTokenAtom } from '../pages/recoil/user/atoms'
import { useAuthSessionInitialization } from './useAuthSessionInitialization'

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}))

jest.mock('../lib/client/error', () => ({
  reportError: jest.fn(),
}))

const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const makeToken = (payload: object) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

const wrapperWithToken =
  (token: string | undefined, strict = false) =>
  ({ children }: { readonly children: React.ReactNode }) => {
    const root = <RecoilRoot initializeState={({ set }) => set(idTokenAtom, token)}>{children}</RecoilRoot>
    return strict ? <StrictMode>{root}</StrictMode> : root
  }

describe('auth session initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses a valid persisted token without querying Amplify', () => {
    const token = makeToken({ exp: Date.now() / 1000 + 3600 })

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        return { initialized: useAuthSessionInitialization(rawToken), rawToken }
      },
      { wrapper: wrapperWithToken(token) }
    )

    expect(result.current).toEqual({ initialized: true, rawToken: token })
    expect(fetchAuthSession).not.toHaveBeenCalled()
  })

  it('restores a missing token from Amplify before completing initialization', async () => {
    const token = makeToken({ exp: Date.now() / 1000 + 3600 })
    let resolveSession: (value: Awaited<ReturnType<typeof fetchAuthSession>>) => void = () => undefined
    jest.mocked(fetchAuthSession).mockReturnValueOnce(
      new Promise<Awaited<ReturnType<typeof fetchAuthSession>>>((resolve) => {
        resolveSession = resolve
      })
    )

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        return { initialized: useAuthSessionInitialization(rawToken), rawToken }
      },
      { wrapper: wrapperWithToken(undefined) }
    )

    expect(result.current).toEqual({ initialized: false, rawToken: undefined })

    await act(async () => {
      resolveSession({
        tokens: { idToken: { toString: () => token } },
      } as Awaited<ReturnType<typeof fetchAuthSession>>)
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current).toEqual({ initialized: true, rawToken: token }))
    expect(fetchAuthSession).toHaveBeenCalledTimes(1)
  })

  it('refreshes an expired persisted token during initialization', async () => {
    const expiredToken = makeToken({ exp: Date.now() / 1000 - 1 })
    const freshToken = makeToken({ exp: Date.now() / 1000 + 3600 })
    jest.mocked(fetchAuthSession).mockResolvedValueOnce({
      tokens: { idToken: { toString: () => freshToken } },
    } as Awaited<ReturnType<typeof fetchAuthSession>>)

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        return { initialized: useAuthSessionInitialization(rawToken), rawToken }
      },
      { wrapper: wrapperWithToken(expiredToken) }
    )

    expect(result.current.initialized).toBe(false)
    await waitFor(() => expect(result.current).toEqual({ initialized: true, rawToken: freshToken }))
  })

  it('replaces a malformed persisted token during initialization', async () => {
    const freshToken = makeToken({ exp: Date.now() / 1000 + 3600 })
    jest.mocked(fetchAuthSession).mockResolvedValueOnce({
      tokens: { idToken: { toString: () => freshToken } },
    } as Awaited<ReturnType<typeof fetchAuthSession>>)

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        return { initialized: useAuthSessionInitialization(rawToken), rawToken }
      },
      { wrapper: wrapperWithToken('not-a-jwt') }
    )

    expect(result.current.initialized).toBe(false)
    await waitFor(() => expect(result.current).toEqual({ initialized: true, rawToken: freshToken }))
  })

  it('clears an expired token when the Amplify session is no longer valid', async () => {
    const expiredToken = makeToken({ exp: Date.now() / 1000 - 1 })
    jest.mocked(fetchAuthSession).mockRejectedValueOnce({ name: 'NotAuthorizedException' })
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        return { initialized: useAuthSessionInitialization(rawToken), rawToken }
      },
      { wrapper: wrapperWithToken(expiredToken) }
    )

    await waitFor(() => expect(result.current).toEqual({ initialized: true, rawToken: undefined }))
    expect(reportError).not.toHaveBeenCalled()
  })

  it('preserves an expired token after a transient initialization failure', async () => {
    const expiredToken = makeToken({ exp: Date.now() / 1000 - 1 })
    const error = new TypeError('Failed to fetch')
    jest.mocked(fetchAuthSession).mockRejectedValueOnce(error)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        return { initialized: useAuthSessionInitialization(rawToken), rawToken }
      },
      { wrapper: wrapperWithToken(expiredToken) }
    )

    await waitFor(() => expect(result.current).toEqual({ initialized: true, rawToken: expiredToken }))
    expect(reportError).toHaveBeenCalledWith(error)
  })

  it('coalesces StrictMode initialization into one Amplify request', async () => {
    jest.mocked(fetchAuthSession).mockResolvedValueOnce({} as Awaited<ReturnType<typeof fetchAuthSession>>)

    const { result } = renderHook(
      () => {
        const rawToken = useRecoilValue(idTokenAtom)
        return useAuthSessionInitialization(rawToken)
      },
      { wrapper: wrapperWithToken(undefined, true) }
    )

    await waitFor(() => expect(result.current).toBe(true))
    expect(fetchAuthSession).toHaveBeenCalledTimes(1)
  })
})
