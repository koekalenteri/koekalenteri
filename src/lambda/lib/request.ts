import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { GenericSchema, InferOutput } from 'valibot'
import { summarizeFieldErrors, validate } from '../../lib/schema/common'
import { response } from './lambda'

/**
 * Validating request bodies lives here rather than in `json.ts` on purpose: `json.ts` is imported by
 * nearly every handler, and the lambdas bundle with `packages: 'external'`, so anything it pulls in is
 * loaded from the dependencies layer on every cold start of every function. Keeping the schema library
 * behind its own module leaves the read endpoints paying nothing for it (see KOE-6).
 */
export const validateBody = <TSchema extends GenericSchema>(
  event: APIGatewayProxyEvent,
  schema: TSchema,
  body: unknown
): { badRequest: APIGatewayProxyResult } | { data: InferOutput<TSchema> } => {
  const result = validate(schema, body)

  if ('errors' in result) {
    const message = `Bad request: ${summarizeFieldErrors(result.errors)}`
    return { badRequest: response(400, { errors: result.errors, message }, event) }
  }

  return { data: result.data }
}
