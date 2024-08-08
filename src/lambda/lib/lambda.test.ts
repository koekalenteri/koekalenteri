import { jest } from '@jest/globals'

import { getParam } from './lambda'
describe('lambda', () => {
  describe('getParam', () => {
    it('should fallback to defaultValue', () => {
      expect(getParam({}, 'test')).toEqual('')
      expect(getParam({}, 'test', 'default')).toEqual('default')
      expect(getParam({ pathParameters: { test: '' } }, 'test', 'default')).toEqual('')
    })

    it('should do happy path', () => {
      expect(getParam({ pathParameters: { regNo: 'FI12345~22' } }, 'regNo')).toEqual('FI12345~22')
    })

    it('should unescape percent encoded strings', () => {
      expect(getParam({ pathParameters: { regNo: 'FI12345%2F22' } }, 'regNo')).toEqual('FI12345/22')
      expect(getParam({ pathParameters: { a: '!%C3%A4%C3%B6%3F' } }, 'a')).toEqual('!äö?')
      expect(getParam({ pathParameters: { a: '%F0%9F%91%8F' } }, 'a')).toEqual('👏')
    })

    it('should not throw on malformed input and return default value instead', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

      expect(() => getParam({ pathParameters: { malformed: '%E0%A4%A' } }, 'malformed')).not.toThrow()
      expect(getParam({ pathParameters: { malformed: '%E0%A4%A' } }, 'malformed', 'def')).toEqual('def')

      expect(errorSpy).toHaveBeenCalledTimes(2)
    })
  })
})
