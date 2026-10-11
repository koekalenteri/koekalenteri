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

/**
 * Runs a conditional write, and again when its condition failed because the row moved meanwhile: each
 * attempt reads the row afresh and redoes its work from it. `write` gets the attempt number, the
 * first working from what the caller already read. After `maxAttempts` the caller's own conflict is
 * thrown; any other failure passes through at once.
 */
export const retryOnConditionFailure = async <T>(
  write: (attempt: number) => Promise<T>,
  maxAttempts: number,
  exhausted: () => Error,
  attempt = 1
): Promise<T> => {
  try {
    return await write(attempt)
  } catch (error) {
    if (!isConditionalCheckFailure(error)) throw error
    if (attempt >= maxAttempts) throw exhausted()
    return retryOnConditionFailure(write, maxAttempts, exhausted, attempt + 1)
  }
}
