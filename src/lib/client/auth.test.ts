import { fetchAuthSession } from 'aws-amplify/auth'
import { getAuthSessionIdToken, isInvalidAuthSessionError } from './auth'

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}))

describe('client auth', () => {
  it('returns no id token for an unauthenticated session', async () => {
    jest.mocked(fetchAuthSession).mockResolvedValue({} as Awaited<ReturnType<typeof fetchAuthSession>>)

    await expect(getAuthSessionIdToken()).resolves.toBeUndefined()
  })

  it('returns the id token provided by Amplify', async () => {
    jest.mocked(fetchAuthSession).mockResolvedValue({
      tokens: { idToken: { toString: () => 'refreshed-id-token' } },
    } as Awaited<ReturnType<typeof fetchAuthSession>>)

    await expect(getAuthSessionIdToken()).resolves.toBe('refreshed-id-token')
  })

  it('propagates an Amplify session initialization failure', async () => {
    const error = { name: 'NotAuthorizedException' }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    jest.mocked(fetchAuthSession).mockRejectedValue(error)

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
