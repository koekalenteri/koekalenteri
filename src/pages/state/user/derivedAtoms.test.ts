import { createStore } from 'jotai'
import { APIError } from '../../../api/http'
import * as userAPI from '../../../api/user'
import * as error from '../../../lib/client/error'
import { idTokenAtom, tokenValidityRevisionAtom, userRefreshAtom } from './atoms'
import { userAtom, validIdTokenAtom } from './derivedAtoms'

const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const makeToken = (payload: object) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

describe('state/user', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('validIdTokenAtom', () => {
    it('keeps the raw expired token but does not expose it to API consumers', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-24T12:00:00.000Z'))
      const token = makeToken({ exp: Date.now() / 1000 + 60 })
      const store = createStore()
      store.set(idTokenAtom, token)
      expect(store.get(validIdTokenAtom)).toBe(token)

      vi.advanceTimersByTime(60_001)
      store.set(tokenValidityRevisionAtom, 1)
      expect(store.get(idTokenAtom)).toBe(token)
      expect(store.get(validIdTokenAtom)).toBeUndefined()
    })

    it.each(['not-a-jwt', makeToken({}), makeToken({ exp: 'tomorrow' })])(
      'does not expose an invalid token to API consumers',
      (token) => {
        const store = createStore()
        store.set(idTokenAtom, token)
        expect(store.get(idTokenAtom)).toBe(token)
        expect(store.get(validIdTokenAtom)).toBeUndefined()
      }
    )
  })

  describe('userAtom', () => {
    it.each([
      { error: new Error('api error'), refresh: 1 },
      { error: new APIError(new Response(null, { status: 408, statusText: 'timeout loading /user' }), {}), refresh: 2 },
    ])('reports a failed user lookup and resolves to null', async ({ error: lookupError, refresh }) => {
      const token = makeToken({ exp: 4_102_444_800 })
      const store = createStore()
      store.set(idTokenAtom, token)
      store.set(userRefreshAtom, refresh)
      vi.spyOn(userAPI, 'getUser').mockRejectedValueOnce(lookupError)
      const reportErrorSpy = vi.spyOn(error, 'reportError').mockImplementation(vi.fn())
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      await expect(store.get(userAtom)).resolves.toBeNull()
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'auth: /user request failed',
        expect.objectContaining({ error: lookupError, refresh, requestId: expect.any(Number) })
      )
      expect(reportErrorSpy).toHaveBeenCalledWith(lookupError)
    })
  })
})
