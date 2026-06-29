import { fetchAuthSession } from 'aws-amplify/auth'
import { useEffect } from 'react'
import { useSetRecoilState } from 'recoil'
import { reportError } from '../../../lib/client/error'
import { idTokenAtom } from './atoms'

const REFRESH_BEFORE_EXPIRY_MS = 60_000
const AUTH_SESSION_ERROR_NAMES = [
  'NotAuthorizedException',
  'TokenRevokedException',
  'UserNotFoundException',
  'PasswordResetRequiredException',
  'UserNotConfirmedException',
  'RefreshTokenReuseException',
  'UserUnAuthenticatedException',
]

export const getJwtExpiresAt = (token: string): number | undefined => {
  const payload = token.split('.')[1]
  if (!payload) return undefined

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    const parsed = JSON.parse(decoded) as { exp?: unknown }

    return typeof parsed.exp === 'number' ? parsed.exp * 1000 : undefined
  } catch {
    return undefined
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

export function useAuthSessionRefresh(idToken: string | undefined) {
  const setIdToken = useSetRecoilState(idTokenAtom)

  useEffect(() => {
    if (!idToken) return

    const expiresAt = getJwtExpiresAt(idToken)
    if (!expiresAt) return

    let cancelled = false
    const refreshDelay = Math.max(expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS, 0)

    const timeout = globalThis.setTimeout(async () => {
      try {
        const session = await fetchAuthSession({ forceRefresh: true })
        const nextToken = session.tokens?.idToken?.toString()
        if (cancelled) return

        if (nextToken) {
          setIdToken((current) => (current === nextToken ? current : nextToken))
        } else {
          setIdToken(undefined)
        }
      } catch (error) {
        if (cancelled) return

        if (isInvalidAuthSessionError(error)) {
          setIdToken(undefined)
        } else {
          reportError(error)
        }
      }
    }, refreshDelay)

    return () => {
      cancelled = true
      globalThis.clearTimeout(timeout)
    }
  }, [idToken, setIdToken])
}
