import { snapshot_UNSTABLE } from 'recoil'
import { APIError } from '../../../api/http'
import * as userAPI from '../../../api/user'
import * as error from '../../../lib/client/error'
import { idTokenAtom, userRefreshAtom } from './atoms'
import { userSelector } from './selectors'

describe('recoil/user', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('userSelector', () => {
    it('should catch error thrown by getUser', async () => {
      const initialSnapshot = snapshot_UNSTABLE(({ set }) => {
        set(idTokenAtom, 'id-token')
        set(userRefreshAtom, 1)
      })
      const release = initialSnapshot.retain()

      const err = new Error('api error')
      jest.spyOn(userAPI, 'getUser').mockRejectedValueOnce(err)
      const reportErrorSpy = jest.spyOn(error, 'reportError').mockImplementation(jest.fn())

      try {
        await expect(initialSnapshot.getPromise(userSelector)).resolves.toBeNull()
        expect(reportErrorSpy).toHaveBeenCalledWith(err)
        expect(reportErrorSpy).toHaveBeenCalledTimes(1)
      } finally {
        release()
      }
    })

    it('should report user lookup timeouts and resolve to null', async () => {
      const initialSnapshot = snapshot_UNSTABLE(({ set }) => {
        set(idTokenAtom, 'id-token')
        set(userRefreshAtom, 2)
      })
      const release = initialSnapshot.retain()

      const err = new APIError(new Response(null, { status: 408, statusText: 'timeout loading /user' }), {})
      jest.spyOn(userAPI, 'getUser').mockRejectedValueOnce(err)
      const reportErrorSpy = jest.spyOn(error, 'reportError').mockImplementation(jest.fn())

      try {
        await expect(initialSnapshot.getPromise(userSelector)).resolves.toBeNull()
        expect(reportErrorSpy).toHaveBeenCalledWith(err)
        expect(reportErrorSpy).toHaveBeenCalledTimes(1)
      } finally {
        release()
      }
    })
  })
})
