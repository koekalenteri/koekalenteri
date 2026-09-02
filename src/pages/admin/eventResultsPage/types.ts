import type { ResultCode, SubmittedTask } from '../../../lib/results'
import type { EventResultElimination, EventResultRetirement, PublicJudge } from '../../../types'

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
  /** Who judged the dog, for event types with no posts to attribute the scoring to. */
  judge?: PublicJudge
  elimination?: EventResultElimination
  retirement?: EventResultRetirement
}

export const emptyEdit: ResultEdit = { tasks: [] }

/** Whether the round ended before it could be scored, so the task inputs have nothing to collect. */
export const isVoided = (edit: ResultEdit): boolean => Boolean(edit.elimination ?? edit.retirement)

/**
 * The edit reduced to what it would store: a task with nothing in it is no task, the order the slots
 * were touched in is nothing, and a judge is their id.
 */
const normalizeEdit = (edit: ResultEdit) => ({
  elimination: edit.elimination ?? null,
  judge: edit.judge?.id ?? null,
  resultCode: edit.resultCode ?? null,
  retirement: edit.retirement ?? null,
  tasks: edit.tasks
    .filter((task) => task.points !== null && task.points !== undefined)
    .map((task) => ({
      index: task.index,
      judge: task.judge?.id ?? null,
      points: task.points,
      stationId: task.stationId,
      zeroFault: task.zeroFault ?? null,
    }))
    .sort((a, b) => a.stationId.localeCompare(b.stationId) || a.index - b.index),
})

/**
 * Whether two edits would store the same thing — so a score typed and cleared again, or a result
 * picked and unpicked, is no change, and the save button says so like the rest of the app does.
 */
export const sameResultEdit = (a: ResultEdit, b: ResultEdit): boolean =>
  JSON.stringify(normalizeEdit(a)) === JSON.stringify(normalizeEdit(b))
