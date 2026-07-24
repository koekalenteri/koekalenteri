import { fetchAuthSession } from 'aws-amplify/auth'
import { getIdTokenDiagnostics } from '../token'
import { authDebug } from './authDiagnostics'

const AUTH_SESSION_ERROR_NAMES = [
  'NotAuthorizedException',
  'TokenRevokedException',
  'UserNotFoundException',
  'PasswordResetRequiredException',
  'UserNotConfirmedException',
  'RefreshTokenReuseException',
  'UserUnAuthenticatedException',
]

export const getAuthSessionIdToken = async (): Promise<string | undefined> => {
  const startedAt = Date.now()
  authDebug('auth: session initialization started')
  try {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    authDebug('auth: session initialization completed', {
      durationMs: Date.now() - startedAt,
      token: token ? getIdTokenDiagnostics(token) : undefined,
    })
    return token
  } catch (error) {
    console.warn('auth: session initialization failed', { durationMs: Date.now() - startedAt, error })
    throw error
  }
}

export const isInvalidAuthSessionError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false

  const { message, name } = error as { message?: unknown; name?: unknown }
  if (typeof name === 'string' && AUTH_SESSION_ERROR_NAMES.some((errorName) => name.startsWith(errorName))) {
    return true
  }

  return typeof message === 'string' && /refresh token|not authenticated|no current user/i.test(message)
}
