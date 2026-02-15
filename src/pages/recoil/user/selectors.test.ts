import { snapshot_UNSTABLE } from 'recoil'
import * as userAPI from '../../../api/user'
import * as error from '../../../lib/client/error'
import { userSelector } from './selectors'

describe('recoil/user', () => {
  describe('userSelector', () => {
    it('should catch error thrown by getUser', async () => {
      const initialSnapshot = snapshot_UNSTABLE()
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
  })
})
