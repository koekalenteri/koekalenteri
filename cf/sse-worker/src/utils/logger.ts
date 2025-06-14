// Logging levels
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Structured logger for consistent log formatting
 */
export class Logger {
  constructor(private source: string) {}

  /**
   * Log a message with the specified level and optional data
   */
  log(level: LogLevel, message: string, data?: Record<string, any>): void {
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level,
      source: this.source,
      message,
      ...data,
    }
    console.log(JSON.stringify(logEntry))
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, data)
  }

  /**
   * Log an info message
   */
  info(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, data)
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, data)
  }

  /**
   * Log an error message with optional error object
   */
  error(message: string, error?: Error, data?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, {
      ...(data || {}),
      error: error ? { message: error.message, stack: error.stack } : undefined,
    })
  }
}

// Create a default logger instance
export const createLogger = (source: string): Logger => new Logger(source)
