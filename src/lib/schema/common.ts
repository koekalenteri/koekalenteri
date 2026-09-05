import type { BaseIssue, GenericSchema, InferOutput, ObjectEntries } from 'valibot'
import {
  array,
  boolean,
  getDotPath,
  looseObject,
  nullable,
  number,
  optional,
  picklist,
  safeParse,
  string,
} from 'valibot'

/**
 * One rejected field, addressed by its dot path into the request body: `dog.regNo`, `dates.0.date`.
 * Empty for an issue about the body as a whole, such as a body that is not an object at all.
 */
interface FieldError {
  field: string
  message: string
}

/**
 * The building blocks every request schema is written from. They exist to fix the wording of the
 * message a rejected field carries: valibot's own is `Invalid type: Expected string but received 123`,
 * where the API has always said `must be a string`, and the field's own path already says which value
 * the sentence is about.
 *
 * A valibot schema is an immutable descriptor, so the parameterless ones are shared instances.
 */
export const str = string('must be a string')
export const num = number('must be a number')
export const bool = boolean('must be a boolean')
export const arrayOf = <TItem extends GenericSchema>(item: TItem) => array(item, 'must be an array')
export const oneOf = <const TOptions extends readonly string[]>(options: TOptions) =>
  picklist(options, `must be one of: ${options.join(', ')}`)
/**
 * An object that keeps the keys it was not asked about. The shared types in `src/types` are the
 * contract; a client one deploy ahead of the backend must not have its new fields silently dropped on
 * the way to the table, which is what a stripping `object()` would do.
 */
export const objectOf = <const TEntries extends ObjectEntries>(entries: TEntries) =>
  looseObject(entries, 'must be an object')
/**
 * An optional field that may also arrive as `null`. A client clears a value by sending null rather
 * than by dropping the key — `handler: null` on a registration edit is an ordinary request — so a
 * schema that accepted only `undefined` would reject the edit it is there to protect.
 */
export const maybe = <TSchema extends GenericSchema>(schema: TSchema) => optional(nullable(schema))

const toFieldError = (issue: BaseIssue<unknown>): FieldError => ({
  field: getDotPath(issue) ?? '',
  // A required field that simply is not there reads as missing, whatever type it wanted; valibot's
  // own wording for it names the key, which the field path already does.
  message: issue.received === 'undefined' ? 'is required' : issue.message,
})

/**
 * Runs a schema and reports every failure per field rather than as one opaque message, so the caller
 * can say which input was wrong. The same schemas serve the lambdas and the frontend's form
 * validation, which is why they live here and not under `src/lambda`.
 */
export const validate = <TSchema extends GenericSchema>(
  schema: TSchema,
  input: unknown
): { data: InferOutput<TSchema> } | { errors: FieldError[] } => {
  const result = safeParse(schema, input)
  if (result.success) return { data: result.output }

  return { errors: result.issues.map(toFieldError) }
}

/** A single-line summary of the first field error, for the `message` every error response carries. */
export const summarizeFieldErrors = (errors: FieldError[]): string => {
  const [first] = errors
  if (!first) return 'invalid request body'

  return first.field ? `${first.field} ${first.message}` : first.message
}
