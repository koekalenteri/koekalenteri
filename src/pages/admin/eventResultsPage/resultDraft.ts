import type { ExerciseSlot } from '@/lib/resultTasks'
import type { EventResult, EventResultConflict } from '@/types'
import type { ResultEdit } from '../../components/stationScoring/types'
import { scoresAtPosts } from '@/lib/liveFormat'
import { deriveNowtResult, formatEventResult, nowtTotals } from '@/lib/results'
import { outcomeDiffers, rebaseTasks, toScoredTasks } from '@/lib/resultTasks'
import { sameResultEdit, seededResultEdit } from '../../components/stationScoring/types'

/**
 * A dog's unsaved edit on the results page and what it started from: the row as stored at the first change.
 * Held together, so an edit cannot outlive or lose the point its changes are measured from (KOE-1701).
 * `version` is undefined for a dog with no stored result, which is a version like any other: a save on it is
 * asked about as soon as anything is stored.
 */
export interface ResultDraft {
  edit: ResultEdit
  version?: EventResult
}

/** How the stored string reads back as an edit: by the dog's own type and class. */
interface ResultReading {
  eventType: string
  eventClass?: string
}

/** An edit as it would be saved on what is stored now. */
export interface RebasedEdit {
  edit: ResultEdit
  /** The exercises where the secretary and another writer each changed the score, to different values. */
  collidedExercises: number[]
  /** The same of the rest of the result: the outcome pair, or a qualitative type's whole result. */
  outcomeCollided: boolean
}

const outcomeOf = ({ elimination, retirement }: ResultEdit) => ({
  ...(elimination ? { elimination } : {}),
  ...(retirement ? { retirement } : {}),
})

/**
 * An edit against what is stored now, one rule at each address of the result: what the edit leaves as it
 * started takes the stored value, what the secretary changed stands, and it is a collision where the stored
 * value has also changed since the start and differs. A round's addresses are its tasks and its outcome, a
 * pair since only one of the two is ever recorded. A qualitative type's result is one address.
 */
export const rebaseResultEdit = (
  { edit, version }: ResultDraft,
  current: EventResult | undefined,
  reading: ResultReading
): RebasedEdit => {
  const { eventClass, eventType } = reading
  const start = seededResultEdit(version, eventType, eventClass)
  const now = seededResultEdit(current, eventType, eventClass)

  if (!scoresAtPosts(eventType)) {
    const untouched = sameResultEdit(edit, start)
    return {
      collidedExercises: [],
      edit: untouched ? now : edit,
      outcomeCollided: !untouched && !sameResultEdit(now, start) && !sameResultEdit(now, edit),
    }
  }

  const { collided, tasks } = rebaseTasks(start.tasks, edit.tasks, now.tasks)
  const untouched = !outcomeDiffers(edit, start)
  return {
    collidedExercises: collided,
    edit: { ...outcomeOf(untouched ? now : edit), tasks },
    outcomeCollided: !untouched && outcomeDiffers(now, start) && outcomeDiffers(now, edit),
  }
}

/**
 * Whether a save holds a collision: anywhere in a whole-round save, and in a post's own view at the exercises
 * it sends. A score held back for another post is decided when the whole round saves it.
 */
export const saveCollides = (rebased: RebasedEdit, sentExercises: readonly number[] | undefined): boolean =>
  rebased.outcomeCollided ||
  rebased.collidedExercises.some((exercise) => !sentExercises || sentExercises.includes(exercise))

/**
 * A conflict as the secretary is asked about it. The server's "mine" is the save it turned down, but choosing
 * it sends the edit on the version that beat it, so the two differ where that version holds a score the page
 * had not heard of. A qualitative type's whole result reads the same either way.
 */
export const conflictAsResent = (
  conflict: EventResultConflict,
  resent: ResultEdit,
  round: readonly ExerciseSlot[],
  { eventClass, eventType }: ResultReading
): EventResultConflict => {
  if (!scoresAtPosts(eventType)) return conflict

  const { elimination: _elimination, result: _result, retirement: _retirement, ...rest } = conflict.submitted
  const scored = toScoredTasks(round, resent.tasks)
  const code = deriveNowtResult({ ...resent, tasks: scored })
  return {
    ...conflict,
    submitted: {
      ...rest,
      ...outcomeOf(resent),
      ...nowtTotals(scored),
      ...(code ? { result: formatEventResult(code, eventType, eventClass) } : {}),
      tasks: resent.tasks.map((task) => ({ ...task, updatedAt: rest.updatedAt, updatedBy: rest.updatedBy })),
    },
  }
}
