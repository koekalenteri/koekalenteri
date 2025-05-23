// test/index.spec.ts
import type { Env } from '../src/index'

import { createExecutionContext, env as baseEnv, waitOnExecutionContext } from 'cloudflare:test'
import { TextDecoder } from 'util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../src/index'

// Create a mock for fetch to simulate Upstash Redis response
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock environment with required Upstash Redis credentials
const env: Env = {
  ...baseEnv,
  UPSTASH_REDIS_REST_URL: 'https://mock-upstash-url.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'mock-token',
}

describe('SSE Worker', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles OPTIONS requests with CORS headers', async () => {
    const request = new Request('http://example.com', {
      method: 'OPTIONS',
    })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400')
  })

  it('returns 400 for missing channel parameter', async () => {
    const request = new Request('http://example.com')
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid channel name')
  })

  it('returns 400 for invalid channel name', async () => {
    const request = new Request('http://example.com?channel=invalid/channel')
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid channel name')
  })

  it('returns SSE stream for valid channel', async () => {
    vi.useFakeTimers()
    const decoder = new TextDecoder()

    // Mock all fetch calls to return empty results after the first one
    // This prevents infinite polling
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([['valid-channel', [['1234567890123-0', ['message', 'test']]]]]),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
      })

    const ac = new AbortController()
    const request = new Request('http://example.com?channel=valid-channel', {
      signal: ac.signal,
    })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Connection')).toBe('keep-alive')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')

    const reader = response.body!.getReader()

    // Read one message to ensure it's correctly streamed
    const { value, done } = await reader.read()
    expect(done).toBe(false)
    expect(decoder.decode(value)).toContain('id: 1234567890123-0')
    expect(decoder.decode(value)).toContain('data: {"message":"test"}')

    // Abort the request to stop all loops
    ac.abort()

    // Advance timers to ensure all timeouts complete
    await vi.runAllTimersAsync()

    // Cancel reader to end stream cleanly
    await reader.cancel()

    // Wait for all async operations to complete
    await waitOnExecutionContext(ctx)

    // Verify the Upstash Redis URL was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith(
      `${env.UPSTASH_REDIS_REST_URL}/xread/streams/valid-channel/$`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
          Accept: 'application/json',
        }),
        signal: ac.signal,
      })
    )
    vi.useRealTimers()
  })

  it('handles upstream errors gracefully', async () => {
    vi.useFakeTimers()
    const decoder = new TextDecoder()

    // First call fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Unauthorized'),
    })

    // Second call succeeds (after backoff)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([['valid-channel', [['1234567890123-0', ['message', 'test after error']]]]]),
      text: () => Promise.resolve(''),
    })

    // All subsequent calls return empty results to prevent infinite polling
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
    })

    const ac = new AbortController()
    const request = new Request('http://example.com?channel=valid-channel', {
      signal: ac.signal,
    })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)

    expect(response.status).toBe(200)

    const reader = response.body!.getReader()

    // Advance time to trigger backoff and retry
    await vi.advanceTimersByTimeAsync(1000)

    // Read the message after successful retry
    const { value, done } = await reader.read()
    expect(done).toBe(false)
    expect(decoder.decode(value)).toContain('data: {"message":"test after error"}')

    // Abort the request to stop all loops
    ac.abort()

    // Advance timers to ensure all timeouts complete
    await vi.runAllTimersAsync()

    await reader.cancel()
    await waitOnExecutionContext(ctx)

    // Verify both fetch calls were made
    expect(mockFetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('verifies keep-alive functionality', async () => {
    vi.useFakeTimers()
    const decoder = new TextDecoder()

    // Mock initial response with a message
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([['valid-channel', [['1234567890123-0', ['message', 'test']]]]]),
      text: () => Promise.resolve(''),
    })

    // Mock empty response for subsequent polls
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
    })

    const ac = new AbortController()
    const request = new Request('http://example.com?channel=valid-channel', { signal: ac.signal })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)

    const reader = response.body!.getReader()

    // First read: expect the real data
    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(decoder.decode(first.value)).toContain('data: {"message":"test"}')

    // Advance time by 30 seconds to trigger ping
    await vi.advanceTimersByTimeAsync(30000)

    // Second read: expect the :ping keep-alive
    const second = await reader.read()
    expect(second.done).toBe(false)
    expect(decoder.decode(second.value)).toBe(':ping\n\n')

    // Abort the request to stop all loops
    ac.abort()

    // Advance timers to ensure all timeouts complete
    await vi.runAllTimersAsync()

    // Cancel reader to end stream cleanly
    await reader.cancel()

    await waitOnExecutionContext(ctx)

    vi.useRealTimers()
  })

  it('tests polling with multiple messages', async () => {
    vi.useFakeTimers()
    const decoder = new TextDecoder()

    // First poll returns one message
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([['valid-channel', [['1234567890123-0', ['message', 'first message']]]]]),
      text: () => Promise.resolve(''),
    })

    // Second poll returns two messages
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          [
            'valid-channel',
            [
              ['1234567890123-1', ['message', 'second message']],
              ['1234567890123-2', ['key1', 'value1', 'key2', 'value2']],
            ],
          ],
        ]),
      text: () => Promise.resolve(''),
    })

    // Third poll returns empty - this ensures the polling loop doesn't continue indefinitely
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
    })

    const ac = new AbortController()
    const request = new Request('http://example.com?channel=valid-channel', { signal: ac.signal })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)

    const reader = response.body!.getReader()

    // First read: first message
    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(decoder.decode(first.value)).toContain('id: 1234567890123-0')
    expect(decoder.decode(first.value)).toContain('data: {"message":"first message"}')

    // Advance time to trigger next poll
    await vi.advanceTimersByTimeAsync(100)

    // Second read: second message
    const second = await reader.read()
    expect(second.done).toBe(false)
    expect(decoder.decode(second.value)).toContain('id: 1234567890123-1')
    expect(decoder.decode(second.value)).toContain('data: {"message":"second message"}')

    // Third read: third message with multiple fields
    const third = await reader.read()
    expect(third.done).toBe(false)
    expect(decoder.decode(third.value)).toContain('id: 1234567890123-2')
    expect(decoder.decode(third.value)).toContain('data: {"key1":"value1","key2":"value2"}')

    // Verify lastId was updated correctly in subsequent calls
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${env.UPSTASH_REDIS_REST_URL}/xread/streams/valid-channel/$`,
      expect.any(Object)
    )

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${env.UPSTASH_REDIS_REST_URL}/xread/streams/valid-channel/1234567890123-0`,
      expect.any(Object)
    )

    // Abort the request to stop all loops
    ac.abort()

    // Advance timers to ensure all timeouts complete
    await vi.runAllTimersAsync()

    await reader.cancel()
    await waitOnExecutionContext(ctx)

    vi.useRealTimers()
  })
})
