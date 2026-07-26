import type { JsonRegistration } from '../../types'

const newRegistrationWorkflowFields = [
  'newRegistrationAuditAt',
  'newRegistrationEmailSentAt',
  'newRegistrationLease',
  'newRegistrationProcessedAt',
  'newRegistrationPublishedAt',
  'newRegistrationStatsAt',
] as const satisfies ReadonlyArray<keyof JsonRegistration>

/** Removes durable and leased state that belongs only to one creation attempt. */
export const removeNewRegistrationWorkflowMetadata = <T extends object>(registration: T): T => {
  const mutable = registration as T & Record<string, unknown>
  for (const field of newRegistrationWorkflowFields) delete mutable[field]
  return registration
}

/** Removes all registration-creation internals, including the retry credential. */
export const removeRegistrationCreationMetadata = <T extends object>(registration: T): T => {
  removeNewRegistrationWorkflowMetadata(registration)
  delete (registration as T & Record<string, unknown>).creationIdempotencyKey
  return registration
}
