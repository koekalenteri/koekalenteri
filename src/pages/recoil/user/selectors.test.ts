import { snapshot_UNSTABLE } from 'recoil'
import { APIError } from '../../../api/http'
import * as userAPI from '../../../api/user'
import * as error from '../../../lib/client/error'
import { idTokenAtom, tokenValidityRevisionAtom, userRefreshAtom } from './atoms'
import { userSelector, validIdTokenSelector } from './selectors'

const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const makeToken = (payload: object) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

describe('recoil/user', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('validIdTokenSelector', () => {
    it('keeps the raw expired token but does not expose it to API consumers', async () => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-07-24T12:00:00.000Z'))
      const token = makeToken({ exp: Date.now() / 1000 + 60 })
      const initialSnapshot = snapshot_UNSTABLE(({ set }) => set(idTokenAtom, token))
      const releaseInitialSnapshot = initialSnapshot.retain()

      try {
        await expect(initialSnapshot.getPromise(validIdTokenSelector)).resolves.toBe(token)

        jest.advanceTimersByTime(60_001)
        const expiredSnapshot = initialSnapshot.map(({ set }) => set(tokenValidityRevisionAtom, 1))
        const releaseExpiredSnapshot = expiredSnapshot.retain()

        try {
          await expect(expiredSnapshot.getPromise(idTokenAtom)).resolves.toBe(token)
          await expect(expiredSnapshot.getPromise(validIdTokenSelector)).resolves.toBeUndefined()
        } finally {
          releaseExpiredSnapshot()
        }
      } finally {
        releaseInitialSnapshot()
      }
    })

    it.each(['not-a-jwt', makeToken({}), makeToken({ exp: 'tomorrow' })])(
      'does not expose an invalid token to API consumers',
      async (token) => {
        const snapshot = snapshot_UNSTABLE(({ set }) => set(idTokenAtom, token))

        await expect(snapshot.getPromise(idTokenAtom)).resolves.toBe(token)
        await expect(snapshot.getPromise(validIdTokenSelector)).resolves.toBeUndefined()
      }
    )
  })

  describe('userSelector', () => {
    it('should catch error thrown by getUser', async () => {
      const token = makeToken({ exp: 4_102_444_800 })
      const initialSnapshot = snapshot_UNSTABLE(({ set }) => {
        set(idTokenAtom, token)
        set(userRefreshAtom, 1)
      })
      const release = initialSnapshot.retain()

      const err = new Error('api error')
      jest.spyOn(userAPI, 'getUser').mockRejectedValueOnce(err)
      const reportErrorSpy = jest.spyOn(error, 'reportError').mockImplementation(jest.fn())
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      try {
        await expect(initialSnapshot.getPromise(userSelector)).resolves.toBeNull()
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'auth: /user request failed',
          expect.objectContaining({ error: err, refresh: 1, requestId: expect.any(Number) })
        )
        expect(reportErrorSpy).toHaveBeenCalledWith(err)
        expect(reportErrorSpy).toHaveBeenCalledTimes(1)
      } finally {
        release()
      }
    })

    it('should report user lookup timeouts and resolve to null', async () => {
      const token = makeToken({ exp: 4_102_444_800 })
      const initialSnapshot = snapshot_UNSTABLE(({ set }) => {
        set(idTokenAtom, token)
        set(userRefreshAtom, 2)
      })
      const release = initialSnapshot.retain()

      const err = new APIError(new Response(null, { status: 408, statusText: 'timeout loading /user' }), {})
      jest.spyOn(userAPI, 'getUser').mockRejectedValueOnce(err)
      const reportErrorSpy = jest.spyOn(error, 'reportError').mockImplementation(jest.fn())
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      try {
        await expect(initialSnapshot.getPromise(userSelector)).resolves.toBeNull()
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'auth: /user request failed',
          expect.objectContaining({ error: err, refresh: 2, requestId: expect.any(Number) })
        )
        expect(reportErrorSpy).toHaveBeenCalledWith(err)
        expect(reportErrorSpy).toHaveBeenCalledTimes(1)
      } finally {
        release()
      }
    })
  })
})
