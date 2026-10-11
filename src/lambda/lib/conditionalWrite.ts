import { isConditionalCheckFailure } from './api-gw'

/**
 * The condition of a write made from a reading: the row still exists, so an update never leaves a
 * stub row holding only the written fields, and the value at `path` is still the one read, or still
 * absent when it was. DynamoDB compares a list or a map by value: against DynamoDB-local, a condition
 * on either, and on one entry of a map, passed for an equal value and failed for a different one
 * (KOE-1510). Writes to the rest of the row never refuse it.
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
  /** The caller's own conflict, thrown once the attempts run out. */
  exhausted: () => Error
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
}: ConditionalWrite<R, T>): Promise<T> => {
  const attempt = async (reading: R, number: number): Promise<T> => {
    try {
      return await work(reading)
    } catch (error) {
      if (!isConditionalCheckFailure(error)) throw error
      if (number >= maxAttempts) throw exhausted()
      return attempt(await reread(), number + 1)
    }
  }
  return attempt(initial, 1)
}
