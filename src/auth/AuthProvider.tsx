import type { Auth0Client } from '@auth0/auth0-spa-js'
import type { PropsWithChildren } from 'react'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRecoilValue, useSetRecoilState } from 'recoil'

import { accessTokenAtom, languageAtom } from '../pages/recoil/user/atoms'

import { getAuth0Client } from './auth0Client'

type AuthState = {
  client?: Auth0Client
  isLoading: boolean
  isAuthenticated: boolean
  error?: unknown
}

type AuthActions = {
  login: (opts?: { connection?: 'google-oauth2' }) => Promise<void>
  logout: () => Promise<void>
  getAccessToken: () => Promise<string | undefined>
}

const AuthContext = createContext<(AuthState & AuthActions) | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ isLoading: true, isAuthenticated: false })
  const setAccessToken = useSetRecoilState(accessTokenAtom)
  const language = useRecoilValue(languageAtom)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const client = await getAuth0Client()

        let didHandleRedirect = false

        // React 18 StrictMode runs effects twice in development, which can cause
        // Auth0 `handleRedirectCallback()` to be invoked twice for the same URL.
        // That yields "Invalid state" on the second invocation.
        //
        // Important: key this by the *state* value so we don't accidentally skip
        // handling a future redirect.
        const redirectHandledKey = 'auth0:redirectHandledState'

        // Handle redirect callback if returning from Auth0.
        if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
          const url = new URL(window.location.href)
          const stateParam = url.searchParams.get('state') ?? ''
          const alreadyHandled = sessionStorage.getItem(redirectHandledKey) === stateParam
          if (!alreadyHandled) {
            try {
              await client.handleRedirectCallback()
            } catch (e: any) {
              // In StrictMode the second invocation can throw even though the first succeeded.
              if (String(e?.message ?? e).includes('Invalid state')) {
                console.warn('[auth] ignoring Invalid state (likely StrictMode double-invoke)', e)
              } else {
                throw e
              }
            }
            sessionStorage.setItem(redirectHandledKey, stateParam)
          }

          didHandleRedirect = true

          // Remove OAuth params from URL.
          url.searchParams.delete('code')
          url.searchParams.delete('state')
          url.searchParams.delete('error')
          url.searchParams.delete('error_description')
          window.history.replaceState({}, document.title, url.pathname + url.search + url.hash)
        }

        let isAuthenticated = await client.isAuthenticated()

        // Bridge Auth0 session -> app auth state.
        try {
          const accessToken = await client.getTokenSilently()
          if (accessToken) {
            setAccessToken(accessToken)
            isAuthenticated = true
          }
        } catch (e: any) {
          const err = String(e?.error ?? e?.message ?? e)
          if (err.toLowerCase().includes('consent') || err.includes('consent_required')) {
            await client.loginWithRedirect({ authorizationParams: { prompt: 'consent', ui_locales: language } })
            return
          }
          if (didHandleRedirect) {
            console.warn('[auth] redirect handled but unauthenticated; clearing token')
            setAccessToken(undefined)
          }
        }

        if (!cancelled) {
          setState({ client, isAuthenticated, isLoading: false })
        }
      } catch (error) {
        console.error('[auth] init failed', error)
        if (!cancelled) {
          setState({ isLoading: false, isAuthenticated: false, error })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setAccessToken])

  const login = useCallback(
    async (opts?: { connection?: 'google-oauth2' }) => {
      const client = state.client ?? (await getAuth0Client())
      await client.loginWithRedirect({
        authorizationParams: {
          ...(opts?.connection ? { connection: opts.connection } : undefined),
          // Force Universal Login UI language to match the app language.
          // Overrides browser / Accept-Language autodetection.
          ui_locales: language,
        },
      })
    },
    [language, state.client]
  )

  const logout = useCallback(async () => {
    const client = state.client ?? (await getAuth0Client())
    setAccessToken(undefined)
    client.logout({ logoutParams: { returnTo: window.location.origin } })
  }, [setAccessToken, state.client])

  const getAccessToken = useCallback(async () => {
    try {
      const client = state.client ?? (await getAuth0Client())
      const token = await client.getTokenSilently()
      return token || undefined
    } catch {
      return
    }
  }, [state.client])

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
      getAccessToken,
    }),
    [getAccessToken, login, logout, state]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
