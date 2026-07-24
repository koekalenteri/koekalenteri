import type { User } from '../../types'
import { getUser } from '../../api/user'
import { getIdTokenDiagnostics } from '../token'
import { authDebug } from './authDiagnostics'

const MAX_CACHED_USER_REQUESTS = 8

interface CachedUserRequest {
  cacheHits: number
  promise: Promise<User>
}

const requests = new Map<string, CachedUserRequest>()
let requestSequence = 0

const requestKey = (token: string, refresh: number) => `${refresh}:${token}`

const trimCache = () => {
  while (requests.size > MAX_CACHED_USER_REQUESTS) {
    const oldest = requests.keys().next().value
    if (oldest === undefined) return
    requests.delete(oldest)
  }
}

/**
 * Adds a second layer of request coalescing around Recoil's selector cache.
 *
 * A token transition can leave old and new Recoil snapshots alive concurrently.
 * Keeping their requests by the selector's actual dependencies prevents cache
 * eviction or remounts from issuing the same /user request in a tight loop.
 */
export const getCurrentUser = (token: string, refresh: number): Promise<User> => {
  const key = requestKey(token, refresh)
  const cached = requests.get(key)
  if (cached) {
    cached.cacheHits++
    const diagnostics = {
      cacheHits: cached.cacheHits,
      refresh,
      token: getIdTokenDiagnostics(token),
    }
    if (cached.cacheHits === 5 || cached.cacheHits % 25 === 0) {
      console.warn('auth: repeated /user request prevented', diagnostics)
    } else {
      authDebug('auth: /user request coalesced', diagnostics)
    }
    return cached.promise
  }

  const requestId = ++requestSequence
  const startedAt = Date.now()
  const tokenDiagnostics = getIdTokenDiagnostics(token, startedAt)
  authDebug('auth: /user request started', { refresh, requestId, token: tokenDiagnostics })

  const promise = getUser(token).then(
    (user) => {
      authDebug('auth: /user request succeeded', {
        durationMs: Date.now() - startedAt,
        refresh,
        requestId,
        token: tokenDiagnostics,
        userId: user.id,
      })
      return user
    },
    (error) => {
      if (requests.get(key)?.promise === promise) {
        requests.delete(key)
      }
      console.warn('auth: /user request failed', {
        durationMs: Date.now() - startedAt,
        error,
        refresh,
        requestId,
        token: tokenDiagnostics,
      })
      throw error
    }
  )

  requests.set(key, { cacheHits: 0, promise })
  trimCache()
  return promise
}

export const clearCurrentUserRequestCache = () => {
  requests.clear()
  requestSequence = 0
}
