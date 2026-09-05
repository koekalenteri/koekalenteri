import { expect } from 'vitest'

type LogLine = Record<string, unknown>

/** Just enough of a Vitest spy on a console method for the lines to be read back. */
interface ConsoleSpy {
  mock: { calls: unknown[][] }
}

/**
 * The lambdas log one JSON object per line (see `lib/log.ts`), so a console spy is called with a
 * single serialized string rather than the message and fields a test wants to assert on. This reads
 * the calls back into the lines that were written:
 *
 * `expect(loggedLines(warnSpy)).toContainEqual(expect.objectContaining({ message: 'user not found' }))`
 *
 * Reading `mock.calls` is the deserialization itself, not the assertion — assert on the returned
 * lines with the usual matchers.
 */
export const loggedLines = (spy: ConsoleSpy): LogLine[] =>
  spy.mock.calls.map(([line]) => (typeof line === 'string' ? JSON.parse(line) : { unparsed: line }))

/**
 * The line the `lambda()` wrapper writes when a handler throws: the thrown error, unpacked by the
 * logger, under a fixed message.
 */
export const unhandledError = (message: string) =>
  expect.objectContaining({ error: expect.objectContaining({ message }), message: 'unhandled error' })
