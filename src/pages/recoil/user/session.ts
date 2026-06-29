import { fetchAuthSession } from 'aws-amplify/auth'
import { useEffect } from 'react'
import { useSetRecoilState } from 'recoil'
import { reportError } from '../../../lib/client/error'
import { idTokenAtom } from './atoms'

const REFRESH_BEFORE_EXPIRY_MS = 60_000

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
        if (!cancelled && nextToken) {
          setIdToken((current) => (current === nextToken ? current : nextToken))
        }
      } catch (error) {
        if (!cancelled) reportError(error)
      }
    }, refreshDelay)

    return () => {
      cancelled = true
      globalThis.clearTimeout(timeout)
    }
  }, [idToken, setIdToken])
}
