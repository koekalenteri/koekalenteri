import type { MockInstance } from 'vitest'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger, LogLevel } from '../../src/utils/logger'

describe('Logger', () => {
  let logger: Logger
  let consoleSpy: MockInstance

  beforeEach(() => {
    // Create a new logger for each test
    logger = new Logger('test-source')

    // Spy on console.log
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterAll(() => {
    // Restore console.log
    consoleSpy.mockRestore()
  })

  describe('log', () => {
    it('should log a message with the specified level', () => {
      logger.log(LogLevel.INFO, 'Test message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'INFO',
        source: 'test-source',
        message: 'Test message',
      })
      expect(loggedData.timestamp).toBeDefined()
    })

    it('should include additional data in the log', () => {
      logger.log(LogLevel.INFO, 'Test message', { key: 'value', number: 123 })

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'INFO',
        source: 'test-source',
        message: 'Test message',
        key: 'value',
        number: 123,
      })
    })
  })

  describe('debug', () => {
    it('should log a debug message', () => {
      logger.debug('Debug message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'DEBUG',
        source: 'test-source',
        message: 'Debug message',
      })
    })

    it('should include additional data', () => {
      logger.debug('Debug message', { debug: true })

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'DEBUG',
        source: 'test-source',
        message: 'Debug message',
        debug: true,
      })
    })
  })

  describe('info', () => {
    it('should log an info message', () => {
      logger.info('Info message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'INFO',
        source: 'test-source',
        message: 'Info message',
      })
    })

    it('should include additional data', () => {
      logger.info('Info message', { info: true })

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'INFO',
        source: 'test-source',
        message: 'Info message',
        info: true,
      })
    })
  })

  describe('warn', () => {
    it('should log a warning message', () => {
      logger.warn('Warning message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'WARN',
        source: 'test-source',
        message: 'Warning message',
      })
    })

    it('should include additional data', () => {
      logger.warn('Warning message', { warn: true })

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'WARN',
        source: 'test-source',
        message: 'Warning message',
        warn: true,
      })
    })
  })

  describe('error', () => {
    it('should log an error message', () => {
      logger.error('Error message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'ERROR',
        source: 'test-source',
        message: 'Error message',
      })
    })

    it('should include error details', () => {
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at test.js:1:1'

      logger.error('Error occurred', error)

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'ERROR',
        source: 'test-source',
        message: 'Error occurred',
        error: {
          message: 'Test error',
          stack: 'Error: Test error\n    at test.js:1:1',
        },
      })
    })

    it('should include additional data with error', () => {
      const error = new Error('Test error')

      logger.error('Error occurred', error, { context: 'test' })

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'ERROR',
        source: 'test-source',
        message: 'Error occurred',
        context: 'test',
        error: {
          message: 'Test error',
        },
      })
    })
  })

  describe('createLogger', () => {
    it('should create a logger with the specified source', async () => {
      // Import createLogger from the module that's already imported at the top
      const { createLogger } = await import('../../src/utils/logger')
      const customLogger = createLogger('custom-source')

      customLogger.info('Test message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0])

      expect(loggedData).toMatchObject({
        level: 'INFO',
        source: 'custom-source',
        message: 'Test message',
      })
    })
  })
})
