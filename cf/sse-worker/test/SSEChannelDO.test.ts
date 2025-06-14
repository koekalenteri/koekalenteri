import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SSEChannelDO } from '../src/SSEChannelDO'

// Mock the logger and metrics
vi.mock('./utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('./utils/metrics', () => ({
  createMetrics: () => ({
    increment: vi.fn(),
    startTimer: vi.fn(),
    endTimer: vi.fn(() => 100), // Mock 100ms duration
    getMetrics: vi.fn(() => ({})),
  }),
}))

describe('SSEChannelDO', () => {
  let durableObject: SSEChannelDO
  let state: DurableObjectState
  let env: any

  beforeEach(() => {
    // Mock DurableObjectState
    state = {
      storage: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        deleteAll: vi.fn(),
        transaction: vi.fn(),
      },
      blockConcurrencyWhile: vi.fn((callback) => callback()),
      id: {
        toString: vi.fn(() => 'test-id'),
        equals: vi.fn(),
        name: 'test-channel',
      },
      waitUntil: vi.fn(),
    } as unknown as DurableObjectState

    env = {}

    // Create a new instance for each test
    // @ts-expect-error - SSEChannelDO constructor doesn't take arguments in the real implementation
    // but for testing we need to pass the state and env
    durableObject = new SSEChannelDO(state, env)

    // supress logs
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('handleConnect', () => {
    it('should return a streaming response with correct headers', async () => {
      // Mock TransformStream
      const mockWriter = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }

      const mockReadable = new ReadableStream({
        start(controller) {
          controller.close() // Close immediately for testing
        },
      })

      // Mock TransformStream constructor
      global.TransformStream = vi.fn().mockImplementation(() => ({
        readable: mockReadable,
        writable: {
          getWriter: () => mockWriter,
        },
      }))

      // Create a request with the necessary properties
      const request = new Request('https://example.com/connect?channel=test-channel', {
        method: 'GET',
      })

      // Add abort signal mock
      Object.defineProperty(request, 'signal', {
        value: {
          aborted: false,
          addEventListener: vi.fn(),
        },
      })

      // Call the method
      const response = await durableObject.fetch(request)

      // Verify the response
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(response.headers.get('Connection')).toBe('keep-alive')
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')

      // Verify that the writer was used to send the initial connection message
      expect(mockWriter.write).toHaveBeenCalled()
    }, 10000) // Increase timeout to 10 seconds

    it('should handle reconnection with lastEventId', async () => {
      // Mock TransformStream
      const mockWriter = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }

      const mockReadable = new ReadableStream({
        start(controller) {
          controller.close() // Close immediately for testing
        },
      })

      // Mock TransformStream constructor
      global.TransformStream = vi.fn().mockImplementation(() => ({
        readable: mockReadable,
        writable: {
          getWriter: () => mockWriter,
        },
      }))

      // Add some test messages to recentMessages
      // @ts-expect-error - Accessing private property for testing
      durableObject.recentMessages = [
        { id: 'msg1', data: '{"test":"data1"}', timestamp: Date.now() },
        { id: 'test-id', data: '{"test":"data2"}', timestamp: Date.now() },
        { id: 'msg3', data: '{"test":"data3"}', timestamp: Date.now() },
      ]

      // Create a request with lastEventId parameter
      const request = new Request('https://example.com/connect?channel=test-channel&lastEventId=test-id', {
        method: 'GET',
      })

      // Add abort signal mock
      Object.defineProperty(request, 'signal', {
        value: {
          aborted: false,
          addEventListener: vi.fn(),
        },
      })

      // Call the method
      const response = await durableObject.fetch(request)

      // Verify the response
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')

      // Verify that the writer was used to send messages
      expect(mockWriter.write).toHaveBeenCalled()

      // It should have been called at least twice (once for connect message, once for the missed message)
      expect(mockWriter.write.mock.calls.length).toBeGreaterThanOrEqual(2)
    }, 10000) // Increase timeout to 10 seconds

    it('should limit the number of connections', async () => {
      // Set a large number of sessions to trigger the limit
      for (let i = 0; i < 1000; i++) {
        // @ts-expect-error - Accessing private property for testing
        durableObject.sessions.set(`session-${i}`, {
          writer: {} as any,
          connectedAt: Date.now(),
          lastActivity: Date.now(),
        })
      }

      // Create a request
      const request = new Request('https://example.com/connect?channel=test-channel', {
        method: 'GET',
      })

      // Call the method
      const response = await durableObject.fetch(request)

      // Verify the response
      expect(response.status).toBe(429)
      const text = await response.text()
      expect(text).toContain('Too many connections')
    })
  })

  describe('handleBroadcast', () => {
    it('should validate message size', async () => {
      // Create a large message
      const largeMessage = { data: 'x'.repeat(2 * 1024 * 1024) } // 2MB

      // Create a request with a large body
      const request = new Request('https://example.com/broadcast?channel=test-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': (2 * 1024 * 1024).toString(),
        },
        body: JSON.stringify(largeMessage),
      })

      // Call the method
      const response = await durableObject.fetch(request)

      // Verify the response
      expect(response.status).toBe(413)
      const text = await response.text()
      expect(text).toContain('Message too large')
    })

    it('should validate JSON format', async () => {
      // Create a request with invalid JSON
      const request = new Request('https://example.com/broadcast?channel=test-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'not-json',
      })

      // Call the method
      const response = await durableObject.fetch(request)

      // Verify the response
      expect(response.status).toBe(400)
      const text = await response.text()
      expect(text).toContain('Invalid JSON')
    })

    it('should broadcast message to all clients', async () => {
      // Create mock writers
      const writers = Array(3)
        .fill(0)
        .map(() => ({
          write: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
        }))

      // Add mock sessions
      for (let i = 0; i < 3; i++) {
        // @ts-expect-error - Accessing private property for testing
        durableObject.sessions.set(`session-${i}`, {
          writer: writers[i] as unknown as WritableStreamDefaultWriter<Uint8Array>,
          connectedAt: Date.now(),
          lastActivity: Date.now(),
        })
      }

      // Create a request with a valid message
      const request = new Request('https://example.com/broadcast?channel=test-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'test' }),
      })

      // Call the method
      const response = await durableObject.fetch(request)

      // Verify the response
      expect(response.status).toBe(200)
      const json = (await response.json()) as { success: boolean; clients: number; messageId: string }
      expect(json.success).toBe(true)
      expect(json.clients).toBe(3)

      // Verify all writers were called
      for (const writer of writers) {
        expect(writer.write).toHaveBeenCalled()
      }
    })

    it('should handle stale connections', async () => {
      // Create mock writers
      const writers = Array(3)
        .fill(0)
        .map(() => ({
          write: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
        }))

      const now = Date.now()
      const staleTime = now - 200000 // 200 seconds ago (stale)
      const freshTime = now - 10000 // 10 seconds ago (fresh)

      // Add mock sessions - 2 fresh, 1 stale
      // @ts-expect-error - Accessing private property for testing
      durableObject.sessions.set('session-0', {
        writer: writers[0] as unknown as WritableStreamDefaultWriter<Uint8Array>,
        connectedAt: freshTime,
        lastActivity: freshTime,
      })

      // @ts-expect-error - Accessing private property for testing
      durableObject.sessions.set('session-1', {
        writer: writers[1] as unknown as WritableStreamDefaultWriter<Uint8Array>,
        connectedAt: staleTime,
        lastActivity: staleTime, // Stale connection
      })

      // @ts-expect-error - Accessing private property for testing
      durableObject.sessions.set('session-2', {
        writer: writers[2] as unknown as WritableStreamDefaultWriter<Uint8Array>,
        connectedAt: freshTime,
        lastActivity: freshTime,
      })

      // Create a request with a valid message
      const request = new Request('https://example.com/broadcast?channel=test-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'test' }),
      })

      // Call the method
      const response = await durableObject.fetch(request)

      // Verify the response
      expect(response.status).toBe(200)
      const json = (await response.json()) as { success: boolean; clients: number; messageId: string }
      expect(json.success).toBe(true)

      // Stale connection should be closed
      expect(writers[1].close).toHaveBeenCalled()

      // Only fresh connections should receive the message
      expect(writers[0].write).toHaveBeenCalled()
      expect(writers[1].write).not.toHaveBeenCalled()
      expect(writers[2].write).toHaveBeenCalled()
    })
  })

  describe('closeClientSession', () => {
    it('should close the writer and remove the session', async () => {
      const writer = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }

      // Add a mock session
      // @ts-expect-error - Accessing private property for testing
      durableObject.sessions.set('test-session', {
        writer: writer as unknown as WritableStreamDefaultWriter<Uint8Array>,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      })

      // Call the method
      // @ts-expect-error - Accessing private method for testing
      await durableObject.closeClientSession('test-session', 'test')

      // Verify the writer was closed
      expect(writer.close).toHaveBeenCalled()

      // Verify the session was removed
      // @ts-expect-error - Accessing private property for testing
      expect(durableObject.sessions.has('test-session')).toBe(false)
    })

    it('should handle errors when closing the writer', async () => {
      const writer = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockRejectedValue(new Error('Test error')),
      }

      // Add a mock session
      // @ts-expect-error - Accessing private property for testing
      durableObject.sessions.set('test-session', {
        writer: writer as unknown as WritableStreamDefaultWriter<Uint8Array>,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      })

      // Call the method
      // @ts-expect-error - Accessing private method for testing
      await durableObject.closeClientSession('test-session', 'test')

      // Verify the writer was closed
      expect(writer.close).toHaveBeenCalled()

      // Verify the session was removed despite the error
      // @ts-expect-error - Accessing private property for testing
      expect(durableObject.sessions.has('test-session')).toBe(false)
    })
  })
})
