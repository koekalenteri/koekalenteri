import type { GenericSchema, InferOutput } from 'valibot'
import { summarizeFieldErrors, validate } from '../../lib/schema/common'
import { httpError } from './lambda'

/**
 * The request body as the schema reads it, or a 400 thrown with every failing field and a message
 * built from them. Validating request bodies lives here rather than in `json.ts` on purpose:
 * `json.ts` is imported by nearly every handler, and anything it pulls in is loaded on every cold
 * start of every function. Keeping the schema library behind its own module leaves the read
 * endpoints paying nothing for it (see KOE-6).
 */
export const validateBody = <TSchema extends GenericSchema>(schema: TSchema, body: unknown): InferOutput<TSchema> => {
  const result = validate(schema, body)

  if ('errors' in result) {
    const message = `Bad request: ${summarizeFieldErrors(result.errors)}`
    throw httpError(400, { errors: result.errors, message })
  }

  return result.data
}
