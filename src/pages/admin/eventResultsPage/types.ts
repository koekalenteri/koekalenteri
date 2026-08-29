import type { SubmittedTask } from '../../../lib/results'

/**
 * One task as the secretary has it on screen. Identical to what goes on the wire: the server assigns
 * provenance, so nothing here has to invent a timestamp it would only overwrite.
 */
export type TaskEdit = SubmittedTask
