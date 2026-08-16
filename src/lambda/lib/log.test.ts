import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { debugProxyEvent } from './log'

const errorSpy = jest.spyOn(console, 'error')
const debugSpy = jest.spyOn(console, 'debug')

describe('log', () => {
  afterEach(() => jest.resetAllMocks())

  describe('debugProxyEvent', () => {
    it('should not throw errors', () => {
      errorSpy.mockImplementationOnce(() => undefined)
      debugSpy.mockImplementationOnce(() => {
        throw new Error('test error')
      })

      expect(debugProxyEvent).not.toThrow()
      expect(errorSpy).toHaveBeenCalledWith('Failed to log request metadata')
    })

    it('should log only explicitly allowed request metadata', () => {
      const evt = constructAPIGwEvent(
        { email: 'participant@example.com' },
        {
          headers: { Authorization: 'Bearer secret', Cookie: 'session=secret', signature: 'secret-signature' },
          method: 'POST',
          path: '/registrations',
          query: { token: 'edit-secret' },
        }
      )
      evt.requestContext.requestId = 'request-id'
      evt.resource = '/registrations'

      debugProxyEvent(evt)

      expect(debugSpy).toHaveBeenCalledTimes(1)
      expect(debugSpy).toHaveBeenCalledWith('request', {
        httpMethod: 'POST',
        requestId: 'request-id',
        resource: '/registrations',
      })
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
