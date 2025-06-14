import type { SSEConfig } from '../types/sse'

import { jest } from '@jest/globals'

// Mock global fetch
const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
} as Response)
global.fetch = mockFetch as unknown as typeof fetch

// Mock console.log to avoid cluttering test output
const mockConsoleLog = jest.fn()
console.log = mockConsoleLog

// Mock getSSEApiToken
const mockGetSSEConfig = jest
  .fn<() => Promise<SSEConfig>>()
  .mockResolvedValue({ SSE_API_URL: 'https://sse.example.com', SSE_API_TOKEN: 'test-api-token' })

// Mock CONFIG
jest.unstable_mockModule('../config', () => ({
  __esModule: true,
  CONFIG: {
    stackName: 'test-stack',
  },
}))

// Mock secrets module
jest.unstable_mockModule('./secrets', () => ({
  __esModule: true,
  getSSEConfig: mockGetSSEConfig,
}))

// Import the module after mocking
const { sse } = await import('./sse')

describe('sse', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    // Reset modules to clear the apiToken cache
    jest.resetModules()
  })

  it('should retrieve SSE configuration from secrets', async () => {
    const testData = { type: 'test', message: 'hello world' }

    await sse(testData)

    expect(mockGetSSEConfig).toHaveBeenCalledTimes(1)
  })

  it('should call fetch with correct URL and parameters', async () => {
    const testData = { type: 'test', message: 'hello world' }

    await sse(testData)

    expect(mockFetch).toHaveBeenCalledWith('https://sse.example.com?channel=test-stack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-token',
      },
      body: JSON.stringify(testData),
    })
  })

  it('should log the event being sent', async () => {
    const testData = { type: 'test', message: 'hello world' }

    await sse(testData)

    expect(mockConsoleLog).toHaveBeenCalledWith('Sending event to clients listening "test-stack", with:', testData)
  })

  it('should properly serialize different data types to JSON', async () => {
    const testData = {
      string: 'test string',
      number: 123,
      boolean: true,
      array: [1, 2, 3],
      object: { key: 'value' },
    }

    await sse(testData)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(testData),
      })
    )
  })

  it('should propagate fetch errors', async () => {
    const testData = { type: 'error-test', message: 'error message' }
    const fetchError = new Error('Network error')

    // Mock fetch to throw an error for this test
    mockFetch.mockRejectedValueOnce(fetchError)

    // The function should throw the fetch error
    await expect(sse(testData)).rejects.toThrow(fetchError)

    // Verify fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith('https://sse.example.com?channel=test-stack', expect.any(Object))
  })

  it('should use different channel names based on stack name', async () => {
    // Temporarily override the CONFIG mock to use a different stack name
    jest.unstable_mockModule('../config', () => ({
      __esModule: true,
      CONFIG: {
        stackName: 'different-stack',
      },
    }))

    // Re-import the module to get a fresh instance with the new CONFIG
    const module = await import('./sse')
    const sseWithDifferentStack = module.sse

    const testData = { type: 'test', message: 'different stack' }

    await sseWithDifferentStack(testData)

    expect(mockFetch).toHaveBeenCalledWith('https://sse.example.com?channel=different-stack', expect.any(Object))
  })

  it('should handle empty data objects', async () => {
    const emptyData = {}

    await sse(emptyData)

    expect(mockFetch).toHaveBeenCalledWith('https://sse.example.com?channel=test-stack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-token',
      },
      body: JSON.stringify(emptyData),
    })
  })

  it('should handle authentication failures', async () => {
    const testData = { type: 'test', message: 'auth failure' }
    const authError = new Error('Unauthorized')

    // Mock fetch to return an unauthorized response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Invalid token' }),
      text: () => Promise.resolve('Unauthorized'),
    } as Response)

    // The function should handle the non-ok response
    await sse(testData)

    // Verify fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith('https://sse.example.com?channel=test-stack', expect.any(Object))
    // In the current implementation, non-ok responses aren't handled specially
    // If you want to add error handling for non-ok responses, this test would need to be updated
  })

  it('should handle malformed SSE API URLs', async () => {
    // Mock getSSEConfig to return a malformed URL
    mockGetSSEConfig.mockResolvedValueOnce({
      SSE_API_URL: 'invalid-url',
      SSE_API_TOKEN: 'test-api-token',
    })

    const testData = { type: 'test', message: 'malformed url' }

    // The current implementation doesn't validate URLs, so this should still attempt to fetch
    await sse(testData)

    // Verify fetch was called with the malformed URL
    expect(mockFetch).toHaveBeenCalledWith('invalid-url?channel=test-stack', expect.any(Object))
  })

  it('should handle large payload data', async () => {
    // Create a large data object
    const largeData = {
      type: 'large-payload',
      items: Array(1000)
        .fill(0)
        .map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'A very long description that takes up space '.repeat(10),
        })),
    }

    await sse(largeData)

    // Verify fetch was called with the large payload
    expect(mockFetch).toHaveBeenCalledWith(
      'https://sse.example.com?channel=test-stack',
      expect.objectContaining({
        body: JSON.stringify(largeData),
      })
    )
  })

  it('should handle network timeouts', async () => {
    const testData = { type: 'test', message: 'timeout test' }
    const timeoutError = new Error('Network timeout')

    // Mock fetch to simulate a timeout
    mockFetch.mockImplementationOnce(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(timeoutError), 100)
      })
    })

    // The function should throw the timeout error
    await expect(sse(testData)).rejects.toThrow(timeoutError)
  })
})
