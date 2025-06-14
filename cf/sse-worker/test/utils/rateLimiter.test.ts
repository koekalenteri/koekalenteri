import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RateLimiter } from '../../src/utils/rateLimiter'

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    // Reset Date.now mock before each test
    vi.restoreAllMocks()

    // Create a new rate limiter for each test
    rateLimiter = new RateLimiter(3, 60) // 3 tokens, refill at 60 per minute (1 per second)
  })

  it('should allow requests when tokens are available', () => {
    // First request should be allowed
    expect(rateLimiter.allowRequest('test-key')).toBe(true)

    // Second request should be allowed
    expect(rateLimiter.allowRequest('test-key')).toBe(true)

    // Third request should be allowed
    expect(rateLimiter.allowRequest('test-key')).toBe(true)
  })

  it('should reject requests when tokens are depleted', () => {
    // Use up all tokens
    expect(rateLimiter.allowRequest('test-key')).toBe(true)
    expect(rateLimiter.allowRequest('test-key')).toBe(true)
    expect(rateLimiter.allowRequest('test-key')).toBe(true)

    // Fourth request should be rejected
    expect(rateLimiter.allowRequest('test-key')).toBe(false)
  })

  it('should refill tokens over time', () => {
    // Mock Date.now to control time
    const now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    // Use up all tokens
    expect(rateLimiter.allowRequest('test-key')).toBe(true)
    expect(rateLimiter.allowRequest('test-key')).toBe(true)
    expect(rateLimiter.allowRequest('test-key')).toBe(true)

    // Fourth request should be rejected
    expect(rateLimiter.allowRequest('test-key')).toBe(false)

    // Advance time by 2 seconds (should refill 2 tokens)
    vi.spyOn(Date, 'now').mockImplementation(() => now + 2000)

    // Next request should be allowed
    expect(rateLimiter.allowRequest('test-key')).toBe(true)

    // Another request should be allowed
    expect(rateLimiter.allowRequest('test-key')).toBe(true)

    // Third request should be rejected again
    expect(rateLimiter.allowRequest('test-key')).toBe(false)
  })

  it('should handle multiple keys independently', () => {
    // Use up all tokens for key1
    expect(rateLimiter.allowRequest('key1')).toBe(true)
    expect(rateLimiter.allowRequest('key1')).toBe(true)
    expect(rateLimiter.allowRequest('key1')).toBe(true)

    // key1 should be rejected
    expect(rateLimiter.allowRequest('key1')).toBe(false)

    // key2 should still have all tokens
    expect(rateLimiter.allowRequest('key2')).toBe(true)
    expect(rateLimiter.allowRequest('key2')).toBe(true)
    expect(rateLimiter.allowRequest('key2')).toBe(true)

    // key2 should now be rejected
    expect(rateLimiter.allowRequest('key2')).toBe(false)
  })

  it('should clean up old entries', () => {
    // Mock Date.now to control time
    const now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    // Create some entries
    rateLimiter.allowRequest('key1')
    rateLimiter.allowRequest('key2')
    rateLimiter.allowRequest('key3')

    // Advance time by 2 hours
    vi.spyOn(Date, 'now').mockImplementation(() => now + 2 * 60 * 60 * 1000)

    // Clean up entries older than 1 hour
    rateLimiter.cleanup(60 * 60 * 1000)

    // All entries should be cleaned up
    // We can verify this by checking that all keys have full tokens again
    expect(rateLimiter.allowRequest('key1')).toBe(true)
    expect(rateLimiter.allowRequest('key1')).toBe(true)
    expect(rateLimiter.allowRequest('key1')).toBe(true)

    expect(rateLimiter.allowRequest('key2')).toBe(true)
    expect(rateLimiter.allowRequest('key2')).toBe(true)
    expect(rateLimiter.allowRequest('key2')).toBe(true)

    expect(rateLimiter.allowRequest('key3')).toBe(true)
    expect(rateLimiter.allowRequest('key3')).toBe(true)
    expect(rateLimiter.allowRequest('key3')).toBe(true)
  })

  it('should not refill beyond max tokens', () => {
    // Mock Date.now to control time
    const now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    // Use 1 token
    expect(rateLimiter.allowRequest('test-key')).toBe(true)

    // Advance time by 10 seconds (should refill 10 tokens, but max is 3)
    vi.spyOn(Date, 'now').mockImplementation(() => now + 10000)

    // Should be able to use exactly 3 tokens
    expect(rateLimiter.allowRequest('test-key')).toBe(true)
    expect(rateLimiter.allowRequest('test-key')).toBe(true)
    expect(rateLimiter.allowRequest('test-key')).toBe(true)

    // Fourth request should be rejected
    expect(rateLimiter.allowRequest('test-key')).toBe(false)
  })
})
