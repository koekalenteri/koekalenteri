import { fetchAuthSession } from 'aws-amplify/auth'
import { getAuthSessionIdToken, isInvalidAuthSessionError } from './auth'

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
}))

describe('client auth', () => {
  it('returns no id token for an unauthenticated session', async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue({} as Awaited<ReturnType<typeof fetchAuthSession>>)

    await expect(getAuthSessionIdToken()).resolves.toBeUndefined()
  })

  it('returns the id token provided by Amplify', async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: { idToken: { toString: () => 'refreshed-id-token' } },
    } as Awaited<ReturnType<typeof fetchAuthSession>>)

    await expect(getAuthSessionIdToken()).resolves.toBe('refreshed-id-token')
  })

  it('propagates an Amplify session initialization failure', async () => {
    const error = { name: 'NotAuthorizedException' }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(fetchAuthSession).mockRejectedValue(error)

    await expect(getAuthSessionIdToken()).rejects.toBe(error)
    expect(warnSpy).toHaveBeenCalledWith('auth: session initialization failed', expect.objectContaining({ error }))
  })

  it.each(['NotAuthorizedException', 'UserUnAuthenticatedException', 'RefreshTokenReuseException'])(
    'treats %s as an invalid auth session',
    (name) => {
      expect(isInvalidAuthSessionError({ name })).toBe(true)
    }
  )

  it('does not treat transient errors as invalid auth sessions', () => {
    expect(isInvalidAuthSessionError(new TypeError('Failed to fetch'))).toBe(false)
  })
})
