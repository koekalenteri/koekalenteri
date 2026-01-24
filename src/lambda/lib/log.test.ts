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
      expect(errorSpy).toHaveBeenCalled()
    })

    it('should log event details', () => {
      const evt = constructAPIGwEvent('message')

      debugProxyEvent(evt)

      expect(debugSpy).toHaveBeenCalledWith('event.headers', {})
      expect(debugSpy).toHaveBeenCalledWith('event.queryStringParameters', {})
      expect(debugSpy).toHaveBeenCalledWith('event.body', '"message"')
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
