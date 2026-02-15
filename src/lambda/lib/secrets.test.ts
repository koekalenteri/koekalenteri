import type { GetParametersCommandOutput } from '@aws-sdk/client-ssm'
import { jest } from '@jest/globals'

// Mock AWS SDK with proper typing
const mockSend = jest.fn().mockImplementation(() => Promise.resolve({} as GetParametersCommandOutput))

jest.mock('@aws-sdk/client-ssm', () => ({
  __esModule: true,
  GetParametersCommand: jest.fn().mockImplementation((params) => params),
  SSMClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
}))

// Mock CONFIG
jest.unstable_mockModule('../config', () => ({
  __esModule: true,
  CONFIG: {
    stackName: 'test-stack',
  },
}))

// Import the module after mocking
const { getKLAPIConfig, getPaytrailConfig, getSSMParams, resetCache } = await import('./secrets')

describe('secrets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSend.mockReset()
    // Reset the cache before each test
    resetCache()
    // Mock console.log to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('getSSMParams', () => {
    it('should retrieve parameters from SSM', async () => {
      // Setup mock response
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'param1', Value: 'value1' },
            { Name: 'param2', Value: 'value2' },
          ],
        } as GetParametersCommandOutput)
      )

      // Call the function
      const result = await getSSMParams(['param1', 'param2'])

      // Verify the SSM service was called with the correct parameters
      expect(mockSend).toHaveBeenCalledWith({ Names: ['param1', 'param2'] })

      // Verify the result
      expect(result).toEqual({
        param1: 'value1',
        param2: 'value2',
      })
    })

    it('should handle missing parameters', async () => {
      // Setup mock response with only one parameter found
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [{ Name: 'param1', Value: 'value1' }],
        } as GetParametersCommandOutput)
      )

      // Call the function
      const result = await getSSMParams(['param1', 'param2'])

      // Verify the result - missing parameter should have empty string
      expect(result).toEqual({
        param1: 'value1',
        param2: '',
      })
    })

    it('should handle empty parameter list', async () => {
      // Call the function with empty array
      const result = await getSSMParams([])

      // Verify the result is an empty object
      expect(result).toEqual({})
    })

    it('should handle null response from SSM', async () => {
      // Setup mock response with undefined Parameters
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: undefined,
        } as GetParametersCommandOutput)
      )

      // Call the function
      const result = await getSSMParams(['param1', 'param2'])

      // Verify the result - all parameters should have empty strings
      expect(result).toEqual({
        param1: '',
        param2: '',
      })
    })
  })

  describe('caching behavior', () => {
    // Save the original Date.now function
    const originalNow = Date.now
    beforeEach(() => {
      // Restore the original Date.now function before each test
      Date.now = originalNow
    })

    afterAll(() => {
      // Ensure Date.now is restored after all tests
      Date.now = originalNow
    })

    it('should cache parameters and not call SSM again for the same parameters', async () => {
      // Setup mock response for first call
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'param1', Value: 'value1' },
            { Name: 'param2', Value: 'value2' },
          ],
        } as GetParametersCommandOutput)
      )

      // First call should fetch from SSM
      const result1 = await getSSMParams(['param1', 'param2'])
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(result1).toEqual({
        param1: 'value1',
        param2: 'value2',
      })

      // Second call with the same parameters should use cache
      const result2 = await getSSMParams(['param1', 'param2'])
      // SSM should not be called again
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(result2).toEqual({
        param1: 'value1',
        param2: 'value2',
      })
    })

    it('should fetch new parameters even when some are cached', async () => {
      // Setup mock response for first call
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [{ Name: 'param1', Value: 'value1' }],
        } as GetParametersCommandOutput)
      )

      // First call to cache param1
      await getSSMParams(['param1'])
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledWith({ Names: ['param1'] })

      // Reset mock call count but keep the implementation
      mockSend.mockClear()

      // Setup mock response for second call
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [{ Name: 'param2', Value: 'value2' }],
        } as GetParametersCommandOutput)
      )

      // Second call with param1 (cached) and param2 (not cached)
      const result = await getSSMParams(['param1', 'param2'])

      // SSM should be called again, but only for param2
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledWith({ Names: ['param2'] })

      expect(result).toEqual({
        param1: 'value1',
        param2: 'value2',
      })
    })

    it('should handle concurrent requests for the same parameters', async () => {
      // Setup mock response
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [{ Name: 'param1', Value: 'value1' }],
        } as GetParametersCommandOutput)
      )

      // Start two concurrent requests
      const promise1 = getSSMParams(['param1'])
      const promise2 = getSSMParams(['param1'])

      // Both should resolve with the same value
      const [result1, result2] = await Promise.all([promise1, promise2])

      // SSM should only be called once
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledWith({ Names: ['param1'] })
      expect(result1).toEqual({ param1: 'value1' })
      expect(result2).toEqual({ param1: 'value1' })
    })

    it('should refresh cache after TTL expires', async () => {
      // Mock Date.now to control time
      let mockTime = 1000000
      Date.now = jest.fn(() => mockTime)

      // Setup mock responses
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [{ Name: 'param1', Value: 'value1' }],
        } as GetParametersCommandOutput)
      )

      // First call should fetch from SSM
      const result1 = await getSSMParams(['param1'])
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledWith({ Names: ['param1'] })
      expect(result1).toEqual({ param1: 'value1' })

      // Second call with the same parameters should use cache
      const result2 = await getSSMParams(['param1'])
      expect(mockSend).toHaveBeenCalledTimes(1) // Still 1, using cache
      expect(result2).toEqual({ param1: 'value1' })

      // Advance time beyond TTL (60 minutes + 1 second)
      mockTime += 60 * 60 * 1000 + 1000

      // Setup mock for the second fetch after TTL expiration
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [{ Name: 'param1', Value: 'updated-value1' }],
        } as GetParametersCommandOutput)
      )

      // Third call should fetch from SSM again because cache expired
      const result3 = await getSSMParams(['param1'])
      expect(mockSend).toHaveBeenCalledTimes(2) // Now 2, fetched again
      expect(mockSend).toHaveBeenCalledWith({ Names: ['param1'] })
      expect(result3).toEqual({ param1: 'updated-value1' })
    })
  })

  describe('getKLAPIConfig', () => {
    it('should retrieve KLAPI configuration', async () => {
      // Setup mock response
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'KL_API_URL', Value: 'https://api.example.com' },
            { Name: 'KL_API_UID', Value: 'test-uid' },
            { Name: 'KL_API_PWD', Value: 'test-pwd' },
          ],
        } as GetParametersCommandOutput)
      )

      // Call the function
      const result = await getKLAPIConfig()

      // Verify the result
      expect(result).toEqual({
        KL_API_PWD: 'test-pwd',
        KL_API_UID: 'test-uid',
        KL_API_URL: 'https://api.example.com',
      })
    })

    it('should throw error when KL_API_URL is missing', async () => {
      // Setup mock response with missing URL
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'KL_API_UID', Value: 'test-uid' },
            { Name: 'KL_API_PWD', Value: 'test-pwd' },
          ],
        } as GetParametersCommandOutput)
      )

      // Verify that the function throws an error
      await expect(getKLAPIConfig()).rejects.toThrow('Missing KLAPI Config!')
    })
  })

  describe('getPaytrailConfig', () => {
    it('should retrieve Paytrail configuration', async () => {
      // Setup mock response
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'test-stack-PAYTRAIL_MERCHANT_ID', Value: 'merchant-123' },
            { Name: 'test-stack-PAYTRAIL_SECRET', Value: 'secret-456' },
          ],
        } as GetParametersCommandOutput)
      )

      // Call the function
      const result = await getPaytrailConfig()

      // Verify the result
      expect(result).toEqual({
        PAYTRAIL_MERCHANT_ID: 'merchant-123',
        PAYTRAIL_SECRET: 'secret-456',
      })
    })

    it('should throw error when Paytrail config is missing', async () => {
      // Setup mock response with missing values
      mockSend.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'test-stack-PAYTRAIL_MERCHANT_ID', Value: 'merchant-123' },
            // Missing PAYTRAIL_SECRET
          ],
        } as GetParametersCommandOutput)
      )

      // Verify that the function throws an error
      await expect(getPaytrailConfig()).rejects.toThrow('Missing Paytrail Config!')
    })
  })
})
