import type { ResultCode, SubmittedTask } from '@/lib/results'
import type { EventResultElimination, EventResultRetirement, EventResultVersion, PublicJudge } from '@/types'
import { scoresAtPosts } from '@/lib/liveFormat'
import { canBeStopped, parseEventResultCode } from '@/lib/results'

/**
 * One task as the secretary has it on screen. Identical to what goes on the wire: the server assigns
 * provenance, so nothing here has to invent a timestamp it would only overwrite.
 */
export type TaskEdit = SubmittedTask

/**
 * One dog's round as it stands on screen.
 *
 * How a round ended is held beside its scores rather than folded into the task list: a round that ended
 * early keeps what it earned up to then (KOE-1669).
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

/**
 * What is stored as an edit starts from it, so a correction edits rather than replaces. A round scored at
 * posts is its tasks and how it ended; a qualitative type's recording is the judge's decision, read back out
 * of the stored string, and who made it.
 */
export const seededResultEdit = (
  stored: Pick<EventResultVersion, 'elimination' | 'judge' | 'result' | 'retirement' | 'tasks'> | undefined,
  eventType: string,
  eventClass?: string
): ResultEdit => {
  if (!stored) return emptyEdit

  const outcome = {
    ...(stored.elimination ? { elimination: stored.elimination } : {}),
    ...(stored.retirement ? { retirement: stored.retirement } : {}),
  }
  if (scoresAtPosts(eventType)) {
    return { ...outcome, tasks: (stored.tasks ?? []).map(({ updatedAt: _at, updatedBy: _by, ...task }) => task) }
  }

  const resultCode = parseEventResultCode(stored.result, eventType, eventClass)
  return {
    ...outcome,
    ...(stored.judge ? { judge: stored.judge } : {}),
    ...(resultCode ? { resultCode } : {}),
    tasks: [],
  }
}

/**
 * The edit with its result replaced. A code that cannot carry a judge's stop (`canBeStopped`) takes the
 * stop away with it: picking the prize is the secretary saying the trial was judged after all, and the
 * control that recorded the stop is greyed out at that code, so it could not take it back itself.
 */
export const withResultCode = (edit: ResultEdit, resultCode?: ResultCode): ResultEdit => {
  const { resultCode: _replaced, retirement, ...rest } = edit
  const keepsStop = retirement?.cause !== 'judgeStopped' || canBeStopped(resultCode)

  return {
    ...rest,
    ...(retirement && keepsStop ? { retirement } : {}),
    ...(resultCode ? { resultCode } : {}),
  }
}

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
      exercise: task.exercise,
      judge: task.judge?.id ?? null,
      part: task.part,
      points: task.points,
      zeroFault: task.zeroFault ?? null,
    }))
    .sort((a, b) => a.exercise - b.exercise || a.part - b.part),
})

/**
 * Whether two edits would store the same thing — so a score typed and cleared again, or a result
 * picked and unpicked, is no change, and the save button says so like the rest of the app does.
 */
export const sameResultEdit = (a: ResultEdit, b: ResultEdit): boolean =>
  JSON.stringify(normalizeEdit(a)) === JSON.stringify(normalizeEdit(b))
