import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { debugProxyEvent } from './log'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

describe('log', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    errorSpy.mockImplementation(() => undefined)
    debugSpy.mockImplementation(() => undefined)
  })

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
