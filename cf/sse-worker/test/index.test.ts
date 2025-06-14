import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../src/index'

vi.mock('../src/utils/rateLimiter', () => {
  const allowRequestMock = vi.fn().mockReturnValue(true)

  return {
    createRateLimiter: vi.fn().mockReturnValue({
      allowRequest: allowRequestMock,
    }),
    // Export the mock so we can access it in tests
    __allowRequestMock: allowRequestMock,
  }
})
// Mock the Durable Object
declare module '../src/utils/rateLimiter' {
  export const __allowRequestMock: ReturnType<typeof vi.fn>
}

const mockDurableObject = {
  fetch: vi.fn().mockImplementation(async (url: string, request: Request) => {
    if (url.includes('/connect')) {
      return new Response('SSE Connection', {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }
    if (url.includes('/broadcast')) {
      return new Response(JSON.stringify({ success: true, clients: 1 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('Not found', { status: 404 })
  }),
}

// Mock the Durable Object namespace
const mockDONamespace = {
  idFromName: vi.fn().mockReturnValue('test-id'),
  get: vi.fn().mockReturnValue(mockDurableObject),
  newUniqueId: vi.fn(),
  idFromString: vi.fn(),
  jurisdiction: vi.fn(),
  getExisting: vi.fn(),
}

let allowRequestMock: ReturnType<typeof vi.fn>

describe('SSE Worker', () => {
  beforeEach(async () => {
    // Reset mocks before each test
    vi.resetAllMocks()

    // Set up environment variables and bindings
    env.API_TOKEN = 'test-token'
    env.SSE_CHANNEL = mockDONamespace

    const rateLimiterModule = await import('../src/utils/rateLimiter')
    allowRequestMock = vi.mocked(rateLimiterModule.__allowRequestMock)

    // supress logs
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks()
  })

  describe('CORS handling', () => {
    it('should handle OPTIONS requests with CORS headers', async () => {
      const request = new Request('https://sse-worker.example.com', {
        method: 'OPTIONS',
      })

      const ctx = createExecutionContext()

      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(resp.status).toBe(204)
      expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(resp.headers.get('Access-Control-Allow-Methods')).toContain('GET')
      expect(resp.headers.get('Access-Control-Allow-Methods')).toContain('POST')
      expect(resp.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
      expect(resp.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    })
  })

  describe('Channel validation', () => {
    it('should return 400 for missing channel parameter', async () => {
      const request = new Request('https://sse-worker.example.com')
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(resp.status).toBe(400)
      const text = await resp.text()
      expect(text).toContain('Invalid channel name')
    })

    it('should return 400 for invalid channel name', async () => {
      const request = new Request('https://sse-worker.example.com?channel=invalid/channel')
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(resp.status).toBe(400)
      const text = await resp.text()
      expect(text).toContain('Invalid channel name')
    })

    it.skip('should accept valid channel names', async () => {
      allowRequestMock.mockReturnValue(true)
      const request = new Request('https://sse-worker.example.com?channel=valid-channel', {
        method: 'GET',
      })
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(resp.status).toBe(200)
      expect(resp.headers.get('Content-Type')).toBe('text/event-stream')
    })
  })

  describe('GET requests (SSE connections)', () => {
    it.skip('should forward GET requests to the Durable Object', async () => {
      // Reset mocks
      vi.clearAllMocks()
      env.SSE_CHANNEL = mockDONamespace

      const request = new Request('https://sse-worker.example.com?channel=test-channel')
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(mockDONamespace.idFromName).toHaveBeenCalledWith('test-channel')
      expect(mockDONamespace.get).toHaveBeenCalledWith('test-id')
      expect(mockDurableObject.fetch).toHaveBeenCalled()

      const url = mockDurableObject.fetch.mock.calls[0][0]
      expect(url).toContain('/connect')

      expect(resp.status).toBe(200)
      expect(resp.headers.get('Content-Type')).toBe('text/event-stream')
    })

    it.skip('should pass lastEventId parameter to Durable Object', async () => {
      // Reset mocks
      vi.clearAllMocks()
      env.SSE_CHANNEL = mockDONamespace

      const request = new Request('https://sse-worker.example.com?channel=test-channel&lastEventId=abc123')
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(mockDurableObject.fetch).toHaveBeenCalled()

      const url = mockDurableObject.fetch.mock.calls[0][0]
      expect(url).toContain('/connect')
      expect(url).toContain('lastEventId=abc123')

      expect(resp.status).toBe(200)
    })

    it('should apply rate limiting for connections', async () => {
      // Reset mocks
      vi.clearAllMocks()
      env.SSE_CHANNEL = mockDONamespace

      // Make the rate limiter reject the request
      allowRequestMock.mockReturnValueOnce(false)

      const request = new Request('https://sse-worker.example.com?channel=test-channel')
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(allowRequestMock).toHaveBeenCalled()

      // Verify the response
      expect(resp.status).toBe(429)
      const text = await resp.text()
      expect(text).toContain('Too many connection attempts')
      expect(resp.headers.get('Retry-After')).toBe('60')
    })
  })

  describe('POST requests (broadcasts)', () => {
    it('should require authorization for broadcast requests', async () => {
      const request = new Request('https://sse-worker.example.com?channel=test-channel', {
        method: 'POST',
        body: JSON.stringify({ message: 'test' }),
      })
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(resp.status).toBe(401)
      const text = await resp.text()
      expect(text).toContain('Unauthorized')
    })

    it('should validate API token for broadcast requests', async () => {
      const request = new Request('https://sse-worker.example.com?channel=test-channel', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'test' }),
      })
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(resp.status).toBe(403)
      const text = await resp.text()
      expect(text).toContain('Invalid token')
    })

    it.skip('should forward authorized broadcast requests to the Durable Object', async () => {
      // Reset mocks
      vi.clearAllMocks()
      env.SSE_CHANNEL = mockDONamespace

      const request = new Request('https://sse-worker.example.com?channel=test-channel', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'test' }),
      })
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(mockDONamespace.idFromName).toHaveBeenCalledWith('test-channel')
      expect(mockDONamespace.get).toHaveBeenCalledWith('test-id')
      expect(mockDurableObject.fetch).toHaveBeenCalled()

      const url = mockDurableObject.fetch.mock.calls[0][0]
      expect(url).toContain('/broadcast')

      expect(resp.status).toBe(200)
      const json = await resp.json()
      expect(json).toEqual({ success: true, clients: 1 })
    })

    it('should apply rate limiting for broadcasts', async () => {
      // Reset mocks
      vi.clearAllMocks()
      env.SSE_CHANNEL = mockDONamespace

      // Make the rate limiter reject the request
      allowRequestMock.mockReturnValueOnce(false)

      const request = new Request('https://sse-worker.example.com?channel=test-channel', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'test' }),
      })
      const ctx = createExecutionContext()
      const resp = await worker.fetch(request, env, ctx)
      await waitOnExecutionContext(ctx)

      expect(allowRequestMock).toHaveBeenCalled()

      // Verify the response
      expect(resp.status).toBe(429)
      const text = await resp.text()
      expect(text).toContain('Rate limit exceeded for broadcasts')
      expect(resp.headers.get('Retry-After')).toBe('60')
    })
  })
})
