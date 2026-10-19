import { randomInt } from 'node:crypto'
import { isConditionalCheckFailure } from './api-gw'

/**
 * The condition of a write made from a reading: the row still exists, so an update never leaves a
 * stub row holding only the written fields, and the value at `path` is still the one read, or still
 * absent when it was. DynamoDB compares a list or a map by value: a condition on either, and on one
 * entry of a map, passes for an equal value and fails for a different one (KOE-1510), which
 * `conditionalWrite.integration.test.ts` runs against DynamoDB-local. Writes to the rest of the row
 * never refuse it.
 *
 * `path` is an expression path whose names `names` defines, `#results.#class` say.
 */
export const foldedFrom = (path: string, names: Record<string, string>, previous: unknown) => {
  const valueCheck = previous === undefined ? `attribute_not_exists(${path})` : `${path} = :foldedFrom`
  return {
    expression: `attribute_exists(#id) AND ${valueCheck}`,
    names: { '#id': 'id', ...names },
    ...(previous === undefined ? {} : { values: { ':foldedFrom': previous } }),
  }
}

interface ConditionalWrite<R, T> {
  /** The reading the caller already has, which the first attempt works from. */
  initial: R
  /** Reads the row again, as last written, for the next attempt. */
  reread: () => Promise<R>
  /** Works out the write from a reading and makes it, on condition the row is still as read. */
  work: (reading: R) => Promise<T>
  maxAttempts: number
  /** What is thrown once the attempts run out: the caller's own conflict, or the last one as it came. */
  exhausted: (lastConflict: unknown) => unknown
  /**
   * Whether a failure means the row moved meanwhile: a failed condition, unless the write is a
   * transaction, whose failed condition cancels it.
   */
  isConflict?: (error: unknown) => boolean
  /** Waits before the next attempt (after the `attempt`th failed), so concurrent writers spread out. */
  wait?: (attempt: number) => Promise<void>
}

/** The bound of the integers `randomInt` draws a fraction from: below its limit of 2^48. */
const FRACTION_STEPS = 2 ** 47

/** A fraction in [0, 1) from the platform's cryptographic source; `draw` gives an integer below its bound. */
export const secureFraction = (draw: (max: number) => number = randomInt) => draw(FRACTION_STEPS) / FRACTION_STEPS

/**
 * A wait of a random length up to `baseMs` doubled per attempt and capped at `maxMs`: writers that
 * collided do not collide again at once. `random` gives a fraction in [0, 1); a test gives its own.
 */
export const jitteredWait =
  (baseMs: number, maxMs: number, random: () => number = secureFraction) =>
  (attempt: number): Promise<void> => {
    const maximumDelay = Math.min(baseMs * 2 ** (attempt - 1), maxMs)
    const delay = Math.floor(random() * maximumDelay)
    return new Promise<void>((resolve) => setTimeout(resolve, delay))
  }

/**
 * Runs a conditional write, and again when its condition failed because the row moved meanwhile: the
 * first attempt works from the caller's reading, each later one from the row read afresh, so the work
 * is redone from what was actually stored. After `maxAttempts` the caller's own conflict is thrown;
 * any other failure passes through at once.
 */
export const retryOnConditionFailure = <R, T>({
  initial,
  reread,
  work,
  maxAttempts,
  exhausted,
  isConflict = isConditionalCheckFailure,
  wait,
}: ConditionalWrite<R, T>): Promise<T> => {
  const attempt = async (reading: R, number: number): Promise<T> => {
    try {
      return await work(reading)
    } catch (error) {
      if (!isConflict(error)) throw error
      if (number >= maxAttempts) throw exhausted(error)
      if (wait) await wait(number)
      return attempt(await reread(), number + 1)
    }
  }
  return attempt(initial, 1)
}
