// test/index.spec.ts
import type { Env } from '../src/index'

import { createExecutionContext, env as baseEnv, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
})
