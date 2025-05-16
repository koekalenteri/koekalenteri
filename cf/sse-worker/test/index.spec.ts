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
    // Mock the Upstash Redis response
    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"message":"test"}\n\n'))
      },
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: mockBody,
      text: () => Promise.resolve(''),
    })

    const request = new Request('http://example.com?channel=valid-channel')
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Connection')).toBe('keep-alive')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')

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
    // Create a spy on Date.now to control time
    const dateSpy = vi.spyOn(Date, 'now')

    // Set up a sequence of timestamps
    // First few calls should return the initial time (1000)
    // This ensures the first message is the data message, not a keep-alive
    dateSpy.mockReturnValueOnce(1000) // start() call
    dateSpy.mockReturnValueOnce(1000) // first pull() call - check for keep-alive
    dateSpy.mockReturnValueOnce(1000) // first pull() call - update last message time

    // Later calls should return a time past the keep-alive interval
    dateSpy.mockReturnValueOnce(35000) // second pull() call - check for keep-alive
    dateSpy.mockReturnValueOnce(35000) // second pull() call - update last message time

    // Create a simple mock for the upstream body
    const mockBody = new ReadableStream({
      start(controller) {
        // Send one message and then keep the stream open
        controller.enqueue(new TextEncoder().encode('data: {"message":"test"}\n\n'))
      },
      pull() {
        // Keep the stream open without sending more data
        return new Promise(() => {})
      },
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: mockBody,
      text: () => Promise.resolve(''),
    })

    // Make the request
    const request = new Request('http://example.com?channel=valid-channel')
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)

    // Get a reader for the response body
    const reader = response.body!.getReader()

    // First read should get the initial message
    const initialResult = await reader.read()
    expect(initialResult.done).toBe(false)
    expect(new TextDecoder().decode(initialResult.value)).toContain('data: {"message":"test"}')

    // Second read should get the keep-alive message
    // This works because our implementation checks the time when pull is called
    const keepAliveResult = await reader.read()
    expect(keepAliveResult.done).toBe(false)
    expect(new TextDecoder().decode(keepAliveResult.value)).toBe(':ping\n\n')

    // Clean up
    reader.cancel()
  })
})
