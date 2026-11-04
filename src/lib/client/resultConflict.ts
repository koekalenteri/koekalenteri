import type { EventResultsResponse, EventResultVersion, JsonEventResultsResponse, StoredEventResult } from '@/types'
import { APIError } from '@/api/http'
import { isObject } from '../utils'
import { toEventResultsResponse } from '../wire'

const isResultsResponse = (body: unknown): body is JsonEventResultsResponse =>
  isObject(body) && [body.conflicts, body.saved, body.unchanged].every(Array.isArray)

/**
 * The answer inside a refused save that lost to another writer: the disputed dogs with both versions, and
 * whatever did get written beside them. A 409 reaches the caller as an error, its body as raw JSON, so its
 * dates are made here as an answer's are. Anything else, the other 409 included, is no conflict.
 *
 * A post's link gets the same answer without the writers' names (`scopeResultToStation`), which is why the
 * screen that serves both reads the conflicts as `ResultConflict`.
 */
export const resultConflictResponse = (error: unknown): EventResultsResponse | undefined =>
  error instanceof APIError && error.status === 409 && isResultsResponse(error.body)
    ? toEventResultsResponse(error.body)
    : undefined

/**
 * Whether a version carries its writer, as an event secretary's answer does, so it can go on the admin's
 * row. A post's link never holds one of these.
 */
export const isStoredEventResult = (stored: {
  id: string
  eventResult: EventResultVersion
}): stored is StoredEventResult => stored.eventResult.updatedBy !== undefined
