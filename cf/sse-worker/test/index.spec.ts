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
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    // Mock the Upstash Redis response
    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"message":"test"}\n\n'))
        // Leave stream open
      },
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: mockBody,
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
    expect(decoder.decode(value)).toContain('data: {"message":"test"}')

    // Abort the request to stop pinger loop (loop has 5s inverval)
    ac.abort()
    vi.advanceTimersByTime(5000)

    // Cancel reader to end stream cleanly
    await reader.cancel()

    await waitOnExecutionContext(ctx)

    // Verify the Upstash Redis URL was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith(
      `${env.UPSTASH_REDIS_REST_URL}/subscribe/valid-channel`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
          Accept: 'text/event-stream',
        }),
      })
    )
    vi.useRealTimers()
  })

  it('returns 502 when upstream fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Unauthorized'),
    })

    const request = new Request('http://example.com?channel=valid-channel')
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(502)
    expect(await response.text()).toBe('Upstream error: Unauthorized')
  })

  it('verifies keep-alive functionality', async () => {
    vi.useFakeTimers()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    // Mock upstream ReadableStream with one message
    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"message":"test"}\n\n'))
        // Leave stream open
      },
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: mockBody,
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

    // Abort the request to stop pinger loop (loop has 5s inverval)
    ac.abort()
    vi.advanceTimersByTime(5000)

    // Cancel reader to end stream cleanly
    await reader.cancel()

    await waitOnExecutionContext(ctx)

    vi.useRealTimers()
  })
})
