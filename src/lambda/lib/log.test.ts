import { jest } from '@jest/globals'

import { constructAPIGwEvent } from '../test-utils/helpers'

import { debugProxyEvent } from './log'

const errorSpy = jest.spyOn(console, 'error')
const logSpy = jest.spyOn(console, 'log')

describe('log', () => {
  afterEach(() => jest.resetAllMocks())

  describe('debugProxyEvent', () => {
    it('should not throw errors', () => {
      errorSpy.mockImplementationOnce(() => undefined)
      logSpy.mockImplementationOnce(() => {
        throw new Error('test error')
      })

      expect(debugProxyEvent).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
    })

    it('should log event details', () => {
      const evt = constructAPIGwEvent('message')

      debugProxyEvent(evt)

      expect(logSpy).toHaveBeenCalledWith('event.headers', {})
      expect(logSpy).toHaveBeenCalledWith('event.queryStringParameters', {})
      expect(logSpy).toHaveBeenCalledWith('event.multivalueHeaders', {})
      expect(logSpy).toHaveBeenCalledWith('event.multiValueQueryStringParameters', {})
      expect(logSpy).toHaveBeenCalledWith('event.body', '"message"')
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
