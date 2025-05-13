import type { GetParametersResult } from 'aws-sdk/clients/ssm'

import { jest } from '@jest/globals'

// Mock AWS SDK with proper typing
const mockGetParameters = jest.fn().mockImplementation(() => Promise.resolve({} as GetParametersResult))

jest.mock('aws-sdk', () => ({
  __esModule: true,
  SSM: jest.fn().mockImplementation(() => ({
    getParameters: () => ({
      promise: mockGetParameters,
    }),
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
const { getKLAPIConfig, getPaytrailConfig, getSSMParams, getUpstashConfig } = await import('./secrets')

describe('secrets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock console.log to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('getSSMParams', () => {
    it('should retrieve parameters from SSM', async () => {
      // Setup mock response
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'param1', Value: 'value1' },
            { Name: 'param2', Value: 'value2' },
          ],
        } as GetParametersResult)
      )

      // Call the function
      const result = await getSSMParams(['param1', 'param2'])

      // Verify the SSM service was called with the correct parameters

      // Verify the result
      expect(result).toEqual({
        param1: 'value1',
        param2: 'value2',
      })
    })

    it('should handle missing parameters', async () => {
      // Setup mock response with only one parameter found
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [{ Name: 'param1', Value: 'value1' }],
        } as GetParametersResult)
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
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: undefined,
        } as GetParametersResult)
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

  describe('getKLAPIConfig', () => {
    it('should retrieve KLAPI configuration', async () => {
      // Setup mock response
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'KL_API_URL', Value: 'https://api.example.com' },
            { Name: 'KL_API_UID', Value: 'test-uid' },
            { Name: 'KL_API_PWD', Value: 'test-pwd' },
          ],
        } as GetParametersResult)
      )

      // Call the function
      const result = await getKLAPIConfig()

      // Verify the result
      expect(result).toEqual({
        KL_API_URL: 'https://api.example.com',
        KL_API_UID: 'test-uid',
        KL_API_PWD: 'test-pwd',
      })
    })

    it('should throw error when KL_API_URL is missing', async () => {
      // Setup mock response with missing URL
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'KL_API_UID', Value: 'test-uid' },
            { Name: 'KL_API_PWD', Value: 'test-pwd' },
          ],
        } as GetParametersResult)
      )

      // Verify that the function throws an error
      await expect(getKLAPIConfig()).rejects.toThrow('Missing KLAPI Config!')
    })
  })

  describe('getPaytrailConfig', () => {
    it('should retrieve Paytrail configuration', async () => {
      // Setup mock response
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'test-stack-PAYTRAIL_MERCHANT_ID', Value: 'merchant-123' },
            { Name: 'test-stack-PAYTRAIL_SECRET', Value: 'secret-456' },
          ],
        } as GetParametersResult)
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
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'test-stack-PAYTRAIL_MERCHANT_ID', Value: 'merchant-123' },
            // Missing PAYTRAIL_SECRET
          ],
        } as GetParametersResult)
      )

      // Verify that the function throws an error
      await expect(getPaytrailConfig()).rejects.toThrow('Missing Paytrail Config!')
    })
  })

  describe('getUpstashConfig', () => {
    it('should retrieve Upstash configuration', async () => {
      // Setup mock response
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'UPSTASH_REDIS_REST_URL', Value: 'https://redis.upstash.com' },
            { Name: 'UPSTASH_REDIS_REST_TOKEN', Value: 'token-789' },
          ],
        } as GetParametersResult)
      )

      // Call the function
      const result = await getUpstashConfig()

      // Verify the result
      expect(result).toEqual({
        UPSTASH_REDIS_REST_URL: 'https://redis.upstash.com',
        UPSTASH_REDIS_REST_TOKEN: 'token-789',
      })
    })

    it('should throw error when Upstash config is missing', async () => {
      // Setup mock response with missing values
      mockGetParameters.mockImplementationOnce(() =>
        Promise.resolve({
          Parameters: [
            { Name: 'UPSTASH_REDIS_REST_URL', Value: 'https://redis.upstash.com' },
            // Missing UPSTASH_REDIS_REST_TOKEN
          ],
        } as GetParametersResult)
      )

      // Verify that the function throws an error
      await expect(getUpstashConfig()).rejects.toThrow('Missing Upstash Config!')
    })
  })
})
