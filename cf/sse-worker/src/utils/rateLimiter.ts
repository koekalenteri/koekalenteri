/**
 * Token bucket rate limiter
 * Limits the rate at which actions can be performed
 */
export class RateLimiter {
  private tokens: Map<string, { count: number; lastRefill: number }> = new Map()
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per millisecond

  /**
   * Create a new rate limiter
   * @param maxTokens Maximum number of tokens in the bucket
   * @param refillRatePerMinute Rate at which tokens are refilled (per minute)
   */
  constructor(maxTokens = 10, refillRatePerMinute = 60) {
    this.maxTokens = maxTokens
    this.refillRate = refillRatePerMinute / (60 * 1000) // Convert to tokens per millisecond
  }

  /**
   * Check if a request is allowed and consume a token if it is
   * @param key Identifier for the rate limit bucket
   * @returns true if the request is allowed, false otherwise
   */
  allowRequest(key: string): boolean {
    const now = Date.now()
    let bucket = this.tokens.get(key)

    // Create a new bucket if one doesn't exist
    if (!bucket) {
      bucket = { count: this.maxTokens, lastRefill: now }
      this.tokens.set(key, bucket)
    }

    // Refill tokens based on time elapsed
    const elapsedTime = now - bucket.lastRefill
    const tokensToAdd = elapsedTime * this.refillRate

    if (tokensToAdd > 0) {
      bucket.count = Math.min(bucket.count + tokensToAdd, this.maxTokens)
      bucket.lastRefill = now
    }

    // Check if we have enough tokens
    if (bucket.count >= 1) {
      bucket.count -= 1
      return true
    }

    return false
  }

  /**
   * Clean up old entries to prevent memory leaks
   * @param maxAgeMs Maximum age of entries to keep (default: 1 hour)
   */
  cleanup(maxAgeMs = 3600000): void {
    const now = Date.now()
    for (const [key, bucket] of this.tokens.entries()) {
      if (now - bucket.lastRefill > maxAgeMs) {
        this.tokens.delete(key)
      }
    }
  }
}

// Factory function to create a rate limiter
export const createRateLimiter = (maxTokens: number, refillRatePerMinute: number): RateLimiter =>
  new RateLimiter(maxTokens, refillRatePerMinute)
