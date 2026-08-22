import type { User } from '../../types'
import { getUser } from '../../api/user'
import { getIdTokenDiagnostics } from '../token'
import { authDebug } from './authDiagnostics'
import { coalesceRequest } from './coalesceRequest'

let requestSequence = 0

/**
 * Coalesces only concurrent /user requests. State remains responsible for
 * longer-lived response caching and invalidation.
 */
export const getCurrentUser = (token: string, refresh: number): Promise<User> =>
  coalesceRequest(`current-user:${refresh}:${token}`, () => {
    const requestId = ++requestSequence
    const startedAt = Date.now()
    const tokenDiagnostics = getIdTokenDiagnostics(token, startedAt)
    authDebug('auth: /user request started', { refresh, requestId, token: tokenDiagnostics })

    return getUser(token, undefined, refresh).then(
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
  })
