import { fetchAuthSession } from 'aws-amplify/auth'
import { useEffect, useRef } from 'react'
import { useSetRecoilState } from 'recoil'
import { isInvalidAuthSessionError } from '../lib/client/auth'
import { authDebug } from '../lib/client/authDiagnostics'
import { reportError } from '../lib/client/error'
import { getIdTokenDiagnostics, getJwtExpiresAt, ID_TOKEN_REFRESH_MARGIN_MS } from '../lib/token'
import { idTokenAtom, tokenValidityRevisionAtom } from '../pages/recoil/user/atoms'

const MIN_REPEATED_REFRESH_DELAY_MS = 30_000

export function useAuthSessionRefresh(idToken: string | undefined) {
  const setIdToken = useSetRecoilState(idTokenAtom)
  const invalidateTokenValidity = useSetRecoilState(tokenValidityRevisionAtom)
  const lastRefreshAtRef = useRef<number>()

  useEffect(() => {
    if (!idToken) return

    const expiresAt = getJwtExpiresAt(idToken)
    if (!expiresAt) return

    let cancelled = false
    let refreshInFlight = false
    const now = Date.now()
    const expiryDelay = Math.max(expiresAt - now - ID_TOKEN_REFRESH_MARGIN_MS, 0)
    const repeatedRefreshDelay = lastRefreshAtRef.current
      ? Math.max(lastRefreshAtRef.current + MIN_REPEATED_REFRESH_DELAY_MS - now, 0)
      : 0
    const refreshDelay = Math.max(expiryDelay, repeatedRefreshDelay)

    if (repeatedRefreshDelay > expiryDelay) {
      console.warn('auth: immediate repeated session refresh prevented', {
        retryInMs: refreshDelay,
        token: getIdTokenDiagnostics(idToken, now),
      })
    } else {
      authDebug('auth: session refresh scheduled', {
        refreshInMs: refreshDelay,
        token: getIdTokenDiagnostics(idToken, now),
      })
    }

    const refresh = async () => {
      if (refreshInFlight || cancelled) return

      const attemptNow = Date.now()
      const retryDelay = lastRefreshAtRef.current
        ? Math.max(lastRefreshAtRef.current + MIN_REPEATED_REFRESH_DELAY_MS - attemptNow, 0)
        : 0
      if (retryDelay > 0) {
        console.warn('auth: immediate repeated session refresh prevented', {
          retryInMs: retryDelay,
          token: getIdTokenDiagnostics(idToken, attemptNow),
        })
        return
      }

      refreshInFlight = true
      const startedAt = Date.now()
      lastRefreshAtRef.current = startedAt
      authDebug('auth: session refresh started', { token: getIdTokenDiagnostics(idToken, startedAt) })
      try {
        const session = await fetchAuthSession({ forceRefresh: true })
        const nextToken = session.tokens?.idToken?.toString()
        if (cancelled) return

        if (nextToken) {
          authDebug('auth: session refresh completed', {
            durationMs: Date.now() - startedAt,
            nextToken: getIdTokenDiagnostics(nextToken),
            previousToken: getIdTokenDiagnostics(idToken),
          })
          setIdToken((current) => (current === nextToken ? current : nextToken))
        } else {
          console.warn('auth: session refresh returned no id token', { durationMs: Date.now() - startedAt })
          setIdToken(undefined)
        }
      } catch (error) {
        if (cancelled) return

        if (isInvalidAuthSessionError(error)) {
          console.warn('auth: session is no longer refreshable', { durationMs: Date.now() - startedAt, error })
          setIdToken(undefined)
        } else {
          console.warn('auth: session refresh failed transiently', { durationMs: Date.now() - startedAt, error })
          reportError(error)
        }
      } finally {
        refreshInFlight = false
      }
    }

    const refreshTimeout = globalThis.setTimeout(() => void refresh(), refreshDelay)
    const expiryTimeout = globalThis.setTimeout(
      () => invalidateTokenValidity((revision) => revision + 1),
      Math.max(expiresAt - now, 0)
    )

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return

      const visibleAt = Date.now()
      if (visibleAt >= expiresAt) {
        invalidateTokenValidity((revision) => revision + 1)
      }
      if (visibleAt >= expiresAt - ID_TOKEN_REFRESH_MARGIN_MS) {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      globalThis.clearTimeout(refreshTimeout)
      globalThis.clearTimeout(expiryTimeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [idToken, invalidateTokenValidity, setIdToken])
}
