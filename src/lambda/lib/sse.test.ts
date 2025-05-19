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

// Mock getUpstashConfig
const mockGetUpstashConfig = jest
  .fn<
    () => Promise<{
      UPSTASH_REDIS_REST_URL: string
      UPSTASH_REDIS_REST_TOKEN: string
    }>
  >()
  .mockResolvedValue({
    UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  })

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
  getUpstashConfig: mockGetUpstashConfig,
}))

// Import the module after mocking
let sse: (data: any) => Promise<void>

describe('sse', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    // Reset modules to clear the cfg cache
    jest.resetModules()
    // Re-import the module to get a fresh instance
    const module = await import('./sse')
    sse = module.sse
  })

  it('should fetch Upstash config if not cached', async () => {
    const testData = { type: 'test', message: 'hello world' }

    await sse(testData)

    expect(mockGetUpstashConfig).toHaveBeenCalledTimes(1)
  })

  it('should not fetch Upstash config if already cached', async () => {
    const testData1 = { type: 'test1', message: 'first message' }
    const testData2 = { type: 'test2', message: 'second message' }

    // First call should fetch the config
    await sse(testData1)
    expect(mockGetUpstashConfig).toHaveBeenCalledTimes(1)

    // Reset the mock counter but not the module
    mockGetUpstashConfig.mockClear()

    // Second call should use cached config within the same test
    await sse(testData2)
    expect(mockGetUpstashConfig).not.toHaveBeenCalled()
  })

  it('should call fetch with correct URL and parameters', async () => {
    const testData = { type: 'test', message: 'hello world' }

    await sse(testData)

    expect(mockFetch).toHaveBeenCalledWith('https://test-redis.upstash.io/xadd/test-stack/*?maxlen=100', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: testData }),
    })
  })

  it('should log the event being sent', async () => {
    const testData = { type: 'test', message: 'hello world' }

    await sse(testData)

    expect(mockConsoleLog).toHaveBeenCalledWith('Sending event to clients listening "test-stack", with:', testData)
  })

  it('should handle different data types', async () => {
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
        body: JSON.stringify({ data: testData }),
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
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-redis.upstash.io/xadd/test-stack/*?maxlen=100',
      expect.any(Object)
    )
  })
})
