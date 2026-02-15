import { gzipSync } from 'node:zlib'
import { jest } from '@jest/globals'
import { CONFIG } from '../config'

// Mock the CONFIG object
jest.mock('../config', () => ({
  CONFIG: {
    stageName: '',
  },
}))

// Mock the getOrigin function
jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: jest.fn(),
}))

const { allowOrigin, getParam, isDevStage, isProdStage, isTestStage, response } = await import('./lambda')
const apiGw = await import('../lib/api-gw')

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

  describe('stage environment functions', () => {
    // Save original stageName to restore after tests
    const originalStageName = CONFIG.stageName

    afterEach(() => {
      // Reset stageName after each test
      CONFIG.stageName = originalStageName
    })

    describe('isDevStage', () => {
      it('should return true when stageName is dev', () => {
        CONFIG.stageName = 'dev'
        expect(isDevStage()).toBe(true)
      })

      it('should return false when stageName is not dev', () => {
        CONFIG.stageName = 'test'
        expect(isDevStage()).toBe(false)

        CONFIG.stageName = 'prod'
        expect(isDevStage()).toBe(false)

        CONFIG.stageName = ''
        expect(isDevStage()).toBe(false)

        CONFIG.stageName = 'something-else'
        expect(isDevStage()).toBe(false)
      })
    })

    describe('isTestStage', () => {
      it('should return true when stageName is test', () => {
        CONFIG.stageName = 'test'
        expect(isTestStage()).toBe(true)
      })

      it('should return false when stageName is not test', () => {
        CONFIG.stageName = 'dev'
        expect(isTestStage()).toBe(false)

        CONFIG.stageName = 'prod'
        expect(isTestStage()).toBe(false)

        CONFIG.stageName = ''
        expect(isTestStage()).toBe(false)

        CONFIG.stageName = 'something-else'
        expect(isTestStage()).toBe(false)
      })
    })

    describe('isProdStage', () => {
      it('should return true when stageName is prod', () => {
        CONFIG.stageName = 'prod'
        expect(isProdStage()).toBe(true)
      })

      it('should return false when stageName is not prod', () => {
        CONFIG.stageName = 'dev'
        expect(isProdStage()).toBe(false)

        CONFIG.stageName = 'test'
        expect(isProdStage()).toBe(false)

        CONFIG.stageName = ''
        expect(isProdStage()).toBe(false)

        CONFIG.stageName = 'something-else'
        expect(isProdStage()).toBe(false)
      })
    })

    describe('allowOrigin', () => {
      // Save original stageName to restore after tests
      const originalStageName = CONFIG.stageName
      const mockGetOrigin = apiGw.getOrigin as jest.Mock

      beforeEach(() => {
        // Reset mocks before each test
        mockGetOrigin.mockClear()
      })

      afterEach(() => {
        // Reset stageName after each test
        CONFIG.stageName = originalStageName
      })

      it('should return origin when it ends with koekalenteri.snj.fi', () => {
        const mockEvent = { headers: {} } as any
        mockGetOrigin.mockReturnValue('https://test.koekalenteri.snj.fi')

        expect(allowOrigin(mockEvent)).toBe('https://test.koekalenteri.snj.fi')
        expect(mockGetOrigin).toHaveBeenCalledWith(mockEvent)
      })

      it('should return origin when it is localhost:3000 and in dev stage', () => {
        const mockEvent = { headers: {} } as any
        mockGetOrigin.mockReturnValue('http://localhost:3000')
        CONFIG.stageName = 'dev'

        expect(allowOrigin(mockEvent)).toBe('http://localhost:3000')
        expect(mockGetOrigin).toHaveBeenCalledWith(mockEvent)
      })

      it('should return default origin when localhost:3000 but not in dev stage', () => {
        const mockEvent = { headers: {} } as any
        mockGetOrigin.mockReturnValue('http://localhost:3000')
        CONFIG.stageName = 'prod'

        expect(allowOrigin(mockEvent)).toBe('https://koekalenteri.snj.fi')
        expect(mockGetOrigin).toHaveBeenCalledWith(mockEvent)
      })

      it('should return default origin for other origins', () => {
        const mockEvent = { headers: {} } as any
        mockGetOrigin.mockReturnValue('https://example.com')

        expect(allowOrigin(mockEvent)).toBe('https://koekalenteri.snj.fi')
        expect(mockGetOrigin).toHaveBeenCalledWith(mockEvent)
      })
    })

    describe('response', () => {
      const mockEvent = {
        headers: {},
      } as any

      it('should create a response with the correct structure', () => {
        const result = response(200, { message: 'Success' }, mockEvent)

        expect(result).toEqual({
          body: JSON.stringify({ message: 'Success' }),
          headers: {
            'Access-Control-Allow-Origin': 'https://koekalenteri.snj.fi',
            'Content-Type': 'application/json',
          },
          statusCode: 200,
        })
      })

      it('should handle error responses', () => {
        const result = response(400, { error: 'Bad Request' }, mockEvent)

        expect(result).toEqual({
          body: JSON.stringify({ error: 'Bad Request' }),
          headers: {
            'Access-Control-Allow-Origin': 'https://koekalenteri.snj.fi',
            'Content-Type': 'application/json',
          },
          statusCode: 400,
        })
      })

      it('should compress large responses when gzip is accepted', () => {
        // Create a large response body
        const largeBody = { data: 'x'.repeat(5000) }
        const mockEventWithGzip = {
          headers: {
            'Accept-Encoding': 'gzip, deflate',
          },
        } as any

        const result = response(200, largeBody, mockEventWithGzip)

        // Verify the response is compressed
        expect(result.isBase64Encoded).toBe(true)
        expect(result.headers).toHaveProperty('Content-Encoding', 'gzip')

        // Verify the body is actually compressed
        const compressedBody = gzipSync(JSON.stringify(largeBody)).toString('base64')
        expect(result.body).toBe(compressedBody)
      })

      it('should not compress small responses even when gzip is accepted', () => {
        const smallBody = { data: 'small' }
        const mockEventWithGzip = {
          headers: {
            'Accept-Encoding': 'gzip, deflate',
          },
        } as any

        const result = response(200, smallBody, mockEventWithGzip)

        // Verify the response is not compressed
        expect(result.isBase64Encoded).toBeUndefined()
        expect(result.headers).not.toHaveProperty('Content-Encoding')
        expect(result.body).toBe(JSON.stringify(smallBody))
      })

      it('should not compress when gzip is not accepted', () => {
        const largeBody = { data: 'x'.repeat(5000) }
        const mockEventWithoutGzip = {
          headers: {
            'Accept-Encoding': 'deflate',
          },
        } as any

        const result = response(200, largeBody, mockEventWithoutGzip)

        // Verify the response is not compressed
        expect(result.isBase64Encoded).toBeUndefined()
        expect(result.headers).not.toHaveProperty('Content-Encoding')
        expect(result.body).toBe(JSON.stringify(largeBody))
      })
    })
  })
})
