import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Metrics } from '../../src/utils/metrics'

describe('Metrics', () => {
  let metrics: Metrics

  beforeEach(() => {
    // Reset Date.now mock before each test
    vi.restoreAllMocks()

    // Create a new metrics instance for each test
    metrics = new Metrics()
  })

  describe('increment', () => {
    it('should increment a counter by the default value (1)', () => {
      metrics.increment('test-counter')
      expect(metrics.getCounter('test-counter')).toBe(1)
    })

    it('should increment a counter by the specified value', () => {
      metrics.increment('test-counter', 5)
      expect(metrics.getCounter('test-counter')).toBe(5)
    })

    it('should accumulate multiple increments', () => {
      metrics.increment('test-counter')
      metrics.increment('test-counter', 2)
      metrics.increment('test-counter', 3)
      expect(metrics.getCounter('test-counter')).toBe(6)
    })

    it('should handle multiple counters independently', () => {
      metrics.increment('counter1')
      metrics.increment('counter2', 2)
      metrics.increment('counter1', 3)

      expect(metrics.getCounter('counter1')).toBe(4)
      expect(metrics.getCounter('counter2')).toBe(2)
    })
  })

  describe('getCounter', () => {
    it('should return 0 for non-existent counters', () => {
      expect(metrics.getCounter('non-existent')).toBe(0)
    })

    it('should return the current value of a counter', () => {
      metrics.increment('test-counter', 5)
      expect(metrics.getCounter('test-counter')).toBe(5)
    })
  })

  describe('startTimer and endTimer', () => {
    it('should measure elapsed time', () => {
      // Mock Date.now to control time
      const now = Date.now()
      vi.spyOn(Date, 'now').mockImplementation(() => now)

      // Start the timer
      metrics.startTimer('test-timer')

      // Advance time by 100ms
      vi.spyOn(Date, 'now').mockImplementation(() => now + 100)

      // End the timer
      const duration = metrics.endTimer('test-timer')

      // Verify the duration
      expect(duration).toBe(100)
    })

    it('should return 0 if the timer was not started', () => {
      const duration = metrics.endTimer('non-existent-timer')
      expect(duration).toBe(0)
    })

    it('should handle multiple timers independently', () => {
      // Mock Date.now to control time
      const now = Date.now()
      vi.spyOn(Date, 'now').mockImplementation(() => now)

      // Start timer1
      metrics.startTimer('timer1')

      // Advance time by 100ms
      vi.spyOn(Date, 'now').mockImplementation(() => now + 100)

      // Start timer2
      metrics.startTimer('timer2')

      // Advance time by another 100ms
      vi.spyOn(Date, 'now').mockImplementation(() => now + 200)

      // End both timers
      const duration1 = metrics.endTimer('timer1')
      const duration2 = metrics.endTimer('timer2')

      // Verify the durations
      expect(duration1).toBe(200)
      expect(duration2).toBe(100)
    })
  })

  describe('getMetrics', () => {
    it('should return all counters as a record', () => {
      metrics.increment('counter1')
      metrics.increment('counter2', 2)
      metrics.increment('counter3', 3)

      const allMetrics = metrics.getMetrics()

      expect(allMetrics).toEqual({
        counter1: 1,
        counter2: 2,
        counter3: 3,
      })
    })

    it('should return an empty object when no metrics exist', () => {
      const allMetrics = metrics.getMetrics()
      expect(allMetrics).toEqual({})
    })
  })

  describe('reset', () => {
    it('should reset all counters', () => {
      metrics.increment('counter1')
      metrics.increment('counter2', 2)

      metrics.reset()

      expect(metrics.getCounter('counter1')).toBe(0)
      expect(metrics.getCounter('counter2')).toBe(0)
      expect(metrics.getMetrics()).toEqual({})
    })

    it('should reset all timers', () => {
      metrics.startTimer('timer1')

      metrics.reset()

      // Timer should no longer exist
      expect(metrics.endTimer('timer1')).toBe(0)
    })
  })
})
