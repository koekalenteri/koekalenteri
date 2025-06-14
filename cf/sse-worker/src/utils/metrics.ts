/**
 * Simple metrics tracking utility
 */
export class Metrics {
  private counters: Map<string, number> = new Map()
  private timers: Map<string, number> = new Map()

  /**
   * Increment a counter by the specified value (default: 1)
   */
  increment(name: string, value = 1): void {
    const current = this.counters.get(name) || 0
    this.counters.set(name, current + value)
  }

  /**
   * Get the current value of a counter
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0
  }

  /**
   * Start a timer with the specified name
   */
  startTimer(name: string): void {
    this.timers.set(name, Date.now())
  }

  /**
   * End a timer and return the duration in milliseconds
   * Returns 0 if the timer wasn't started
   */
  endTimer(name: string): number {
    const start = this.timers.get(name)
    if (start === undefined) {
      return 0
    }

    const duration = Date.now() - start
    this.timers.delete(name)
    return duration
  }

  /**
   * Get all metrics as a record
   */
  getMetrics(): Record<string, number> {
    const result: Record<string, number> = {}

    // Add counters
    for (const [name, value] of this.counters.entries()) {
      result[name] = value
    }

    return result
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear()
    this.timers.clear()
  }
}

// Create a default metrics instance
export const createMetrics = (): Metrics => new Metrics()
