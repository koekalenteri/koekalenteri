import type { ResultCode, SubmittedTask } from '../../../lib/results'
import type { EventResultElimination, EventResultRetirement } from '../../../types'

/**
 * One task as the secretary has it on screen. Identical to what goes on the wire: the server assigns
 * provenance, so nothing here has to invent a timestamp it would only overwrite.
 */
export type TaskEdit = SubmittedTask

/**
 * One dog's round as it stands on screen.
 *
 * A round that was eliminated or withdrawn is not a round with low scores — it has no scores to give,
 * so the two are held side by side rather than folded into the task list.
 */
export interface ResultEdit {
  tasks: TaskEdit[]
  /** The judge's decision as entered, for event types where no derivation exists to produce one. */
  resultCode?: ResultCode
  elimination?: EventResultElimination
  retirement?: EventResultRetirement
}

export const emptyEdit: ResultEdit = { tasks: [] }

/** Whether the round ended before it could be scored, so the task inputs have nothing to collect. */
export const isVoided = (edit: ResultEdit): boolean => Boolean(edit.elimination ?? edit.retirement)
