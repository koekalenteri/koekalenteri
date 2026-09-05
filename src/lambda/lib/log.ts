import type { APIGatewayProxyEvent } from 'aws-lambda'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

/**
 * Fields shared by every line of one invocation. The wrapper sets them once, so a log call does not
 * have to carry the request identity through the call stack to get it into the line.
 */
interface LogContext {
  /** API Gateway request id: the key that ties one request's lines together in CloudWatch Insights. */
  requestId?: string
  /** Name of the API, as given to `lambda()` — lets Insights count errors per interface. */
  service?: string
  /** WebSocket connection the line belongs to, for the socket lambdas. */
  connectionId?: string
}

type LogFields = Record<string, unknown>

type LogLevel = 'debug' | 'error' | 'info' | 'warn'

const storage = new AsyncLocalStorage<LogContext>()

/** Runs `fn` with `context` attached to every log line it and its awaited callees write. */
export const withLogContext = <T>(context: LogContext, fn: () => T): T => storage.run(context, fn)

/**
 * A person's identity never goes into a log line as itself: an email or a name would spread personal
 * data across the whole CloudWatch retention. This gives a stable, non-reversible handle instead, so
 * the lines concerning one person can still be tied together while a problem is being looked into.
 */
export const hashIdentity = (identity: string): string =>
  createHash('sha256').update(identity.trim().toLowerCase()).digest('hex').slice(0, 16)

/**
 * An Error does not survive JSON.stringify — it serializes to `{}`, message, stack and all. Unpack
 * it wherever it appears in the fields, nested ones included.
 */
const replacer = (_key: string, value: unknown) =>
  value instanceof Error ? { message: value.message, name: value.name, stack: value.stack } : value

const writers: Record<LogLevel, (line: string) => void> = {
  debug: (line) => console.debug(line),
  error: (line) => console.error(line),
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
}

const write = (level: LogLevel, message: string, fields?: LogFields) => {
  const emit = writers[level]
  const context = storage.getStore()

  try {
    emit(JSON.stringify({ level, message, ...context, ...fields }, replacer))
  } catch (error) {
    // A single unserializable field (a cycle, a bigint) must not take the whole line with it: the
    // message and the request it belongs to are the part worth keeping.
    emit(
      JSON.stringify({
        level,
        message,
        ...context,
        fieldsError: error instanceof Error ? error.message : 'fields could not be serialized',
      })
    )
  }
}

/**
 * Structured logging for the lambdas. Every line is one JSON object, so CloudWatch Insights can
 * filter and count on the fields instead of matching free text. See AGENTS.md for the query that
 * collects one request's lines.
 */
export const logger = {
  debug: (message: string, fields?: LogFields) => write('debug', message, fields),
  error: (message: string, fields?: LogFields) => write('error', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: (message: string, fields?: LogFields) => write('warn', message, fields),
}

export const debugProxyEvent = (event: APIGatewayProxyEvent) => {
  logger.debug('request', { httpMethod: event.httpMethod, resource: event.resource })
}
