import type { EventResultRetirement, JsonEventResultTask, StationVisitLayout } from '../types'
import type { RotationDog, RotationEvent } from './rotation'
import { objectsDiffer } from './diff'
import { dogVisits } from './rotation'
import { isObject } from './utils'

/**
 * An exercise (the rules' rasti; a `task` in this module's older names) is always worth 20, whether it is
 * scored whole or in two parts of 10: §5.3.1, "Jokaisen rastin enimmäispistemäärä on 20 pistettä". A
 * group may do two exercises in a row at one post, each of 20 (KOE-1665).
 */
const TASK_MAX_POINTS = 20

/** A task's points split evenly between its parts, so the parts always add up to the task. */
export const partMaxPoints = (parts: 1 | 2): number => TASK_MAX_POINTS / parts

/** One part of an exercise as scored for one dog, joined to its definition in the dog's round. */
export interface ScoredTask {
  stationId: string
  /** The exercise's number in the dog's running order. Its parts share it; the first-prize floor reads it. */
  task?: number
  /** The task's nominal maximum. Never the halved figure from an ALO recall. */
  maxPoints: number
  /** `null` while unscored. */
  points: number | null
}

/**
 * One scored slot in a dog's round: an exercise, or one part of a split exercise (KOE-1665).
 *
 * A score is stored at its post and its slot there (`stationId`, `index`), never at the exercise number:
 * the judge scored the dog at a post, so a running order reordered or a range edited later keeps each
 * score with the post that gave it. An exercise moved to another post therefore leaves its score on
 * the old post, where it no longer counts. The number, the part and the maximum are read off the dog's
 * running order for the screens.
 */
export interface ExerciseSlot {
  stationId: string
  /**
   * 0-based slot at the post, the address a stored score carries: the parts of the exercises the group
   * does there, counted in exercise order. A post stored before KOE-1665 with `tasks: 2` is one exercise in two parts,
   * so its slots 0 and 1 read as before.
   */
  index: number
  /** The exercise's number in the dog's running order, from 1. */
  exercise: number
  /** 0-based part of the exercise. */
  part: number
  /** The parts the exercise splits into. */
  parts: 1 | 2
  maxPoints: number
}

/**
 * The scored slots of one visit to a post: its exercise, whole or in parts, addressed from the slots the
 * group's exercises there take before it. Expanding the split here rather than storing each slot means
 * an exercise's parts cannot fail to add up to it.
 */
export const visitSlots = (
  stationId: string,
  { exercise, parts, slotsBefore }: Pick<StationVisitLayout, 'exercise' | 'parts' | 'slotsBefore'>
): ExerciseSlot[] =>
  Array.from({ length: parts }, (_unused, part) => ({
    exercise,
    index: slotsBefore + part,
    maxPoints: partMaxPoints(parts),
    part,
    parts,
    stationId,
  }))

/** The posts of a dog's running order, an exercise each, in its order: index n is exercise n + 1. */
export const exercisePostsOf = (round: readonly Pick<ExerciseSlot, 'stationId' | 'exercise'>[]): string[] => {
  const posts: string[] = []
  for (const slot of round) posts[slot.exercise - 1] = slot.stationId
  return posts
}

/**
 * The exercise a dog's round ended at (KOE-1669). The post is the durable locator and the exercise the
 * refinement for a post the group comes to more than once (KOE-1665): the stored number is trusted only
 * while it still names an exercise at that post, since a running order changed later moves the numbers
 * and nothing rewrites a stored outcome. Otherwise, and for a stop stored with its post alone, it is the
 * last exercise at the post, so nothing stored reads as ending earlier than it can have. None where the
 * round did not end early, where the place is not recorded ("Ei tiedossa"), or where the post has left
 * the running order.
 */
export const endedAtExercise = (
  place: Pick<EventResultRetirement, 'stationId' | 'exercise'> | undefined,
  exercisePosts: readonly string[]
): number | undefined => {
  const { stationId, exercise } = place ?? {}
  if (exercise !== undefined && (!stationId || exercisePosts[exercise - 1] === stationId)) {
    return exercise <= exercisePosts.length ? exercise : undefined
  }
  if (!stationId) return undefined
  const last = exercisePosts.lastIndexOf(stationId)
  return last < 0 ? undefined : last + 1
}

/**
 * Whether a dog's round ended at an exercise before this one, so the dog never reached it and it reads
 * "kesk" (KOE-1669). The exercise it ended at is still entered.
 */
export const endedBefore = (
  retirement: Pick<EventResultRetirement, 'stationId' | 'exercise'> | undefined,
  exercise: number,
  exercisePosts: readonly string[]
): boolean => {
  const at = endedAtExercise(retirement, exercisePosts)
  return at !== undefined && exercise > at
}

/**
 * The scored slots of one dog's round, in its group's running order (KOE-1665): one exercise at each
 * post of its day in number order where the day has no running order of its own. A day without posts
 * has an empty round.
 */
export const dogRound = (event: RotationEvent, dog: RotationDog): ExerciseSlot[] =>
  dogVisits(event, dog).flatMap((visit) => visitSlots(visit.station.id, visit))

/** A column of the results table: an exercise number, split the same way, and a part of it. */
export const columnKey = (slot: Pick<ExerciseSlot, 'exercise' | 'part' | 'parts'>): string =>
  `${slot.exercise}#${slot.parts}#${slot.part}`

/**
 * The columns of a table of dogs whose rounds may differ: every exercise number any of them has, split
 * as each has it, in exercise order. A column is "Rasti 3" whatever post a dog's group did it at.
 */
export const roundColumns = (rounds: readonly (readonly ExerciseSlot[])[]): ExerciseSlot[] => {
  const seen = new Set<string>()
  return rounds
    .flat()
    .filter((slot) => {
      const key = columnKey(slot)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.exercise - b.exercise || a.parts - b.parts || a.part - b.part)
}

/** Where a stored score sits: its post and its slot there, the address `visitSlots` gives it. */
const slotKey = (slot: Pick<ExerciseSlot, 'stationId' | 'index'>): string => `${slot.stationId}#${slot.index}`

/** Whether a dog's slot holds this stored score. */
export const holdsScore = (
  slot: Pick<ExerciseSlot, 'stationId' | 'index'>,
  task: Pick<ExerciseSlot, 'stationId' | 'index'>
) => slotKey(slot) === slotKey(task)

/**
 * Whether a slot reads a stored score the same way in two rounds: the same slot of the post, split the
 * same way. A slot's index counts parts, so a change of `parts` gives an index another exercise or
 * another maximum, and a score kept there would be read with a meaning it was not given. The exercise
 * number may change: the score stays with the post that gave it.
 */
const sameSlot = (a: ExerciseSlot | undefined, b: ExerciseSlot | undefined): boolean => {
  if (!a || !b) return false
  return a.parts === b.parts && a.part === b.part
}

/**
 * Whether a stored task records anything. The results table stores a slot it shows as unscored
 * (`points: null`) as soon as the row is edited, so a task without points, a zero's reason or a recall
 * is an empty field, and dropping it loses nothing the secretary would need to be asked about.
 */
export const isRecordedTask = (task: Pick<JsonEventResultTask, 'points' | 'recalled' | 'zeroFault'>): boolean =>
  task.points !== null || Boolean(task.zeroFault) || Boolean(task.recalled)

const slotsByKey = (round: readonly ExerciseSlot[]) => new Map(round.map((slot) => [slotKey(slot), slot]))

/**
 * Whether a dog's round scores differently after a change of the posts, the rotation or the classes
 * (KOE-1666): a slot added, removed, or meaning something else. A new order of the same slots is not a
 * difference, since the total and the prize do not depend on it.
 */
export const roundsDiffer = (before: readonly ExerciseSlot[], after: readonly ExerciseSlot[]): boolean => {
  if (before.length !== after.length) return true
  const next = slotsByKey(after)
  return before.some((slot) => !sameSlot(slot, next.get(slotKey(slot))))
}

/** How many slots a round has at each post. */
const slotCounts = (round: readonly ExerciseSlot[]) => {
  const counts = new Map<string, number>()
  for (const slot of round) counts.set(slot.stationId, (counts.get(slot.stationId) ?? 0) + 1)
  return counts
}

/**
 * The stored scores a new round keeps, and the ones it drops (KOE-1666). A score is kept only where its
 * slot means the same in the dog's round before the change and after it; everything else is dropped,
 * a score the old round did not read either. The event save warns about the dropped ones before it
 * writes, and the recompute leaves them out, so no score is read against an exercise it was not given for.
 *
 * A score's address is its slot's place among the post's slots (KOE-1665). Where the number of slots at
 * a post changes, an exercise added there before another or one of its repeats taken out, the places
 * shift and a kept score would land on another exercise. So a changed count at a post drops every score
 * of that post, each named in the warning; an unchanged count keeps them by place as before.
 */
export const reconcileRoundTasks = <T extends Pick<JsonEventResultTask, 'stationId' | 'index'>>(
  before: readonly ExerciseSlot[],
  after: readonly ExerciseSlot[],
  tasks: readonly T[] | undefined
): { kept: T[]; dropped: T[] } => {
  const previous = slotsByKey(before)
  const next = slotsByKey(after)
  const countsBefore = slotCounts(before)
  const countsAfter = slotCounts(after)
  const kept: T[] = []
  const dropped: T[] = []
  for (const task of tasks ?? []) {
    const key = slotKey(task)
    const countKept = countsBefore.get(task.stationId) === countsAfter.get(task.stationId)
    if (countKept && sameSlot(previous.get(key), next.get(key))) kept.push(task)
    else dropped.push(task)
  }
  return { dropped, kept }
}

/**
 * How many exercises of a round some scores are of: the parts of one exercise count once, and a score the
 * round does not read counts on its own. What the secretary is told of dropped scores is exercises.
 */
export const exercisesScored = (
  round: readonly ExerciseSlot[],
  tasks: readonly Pick<JsonEventResultTask, 'stationId' | 'index'>[]
): number =>
  new Set(
    tasks.map((task) => {
      const slot = round.find((item) => holdsScore(item, task))
      return slot ? `exercise ${slot.exercise}` : slotKey(task)
    })
  ).size

/** A dog that would lose recorded scores to a change of the posts, as the secretary is asked about it. */
export interface DroppedTasksDog {
  id: string
  name: string
  class?: string
  /** The start number, where the dog has one. */
  number?: number
  /** How many exercises it loses recorded scores of, a split exercise counted once. */
  tasks: number
}

/**
 * The event save's answer when a change of the posts, the rotation or the classes would drop recorded
 * scores (KOE-1666). `confirmation` is opaque: a save that sends it back confirms this very set of drops,
 * and a set that has changed since is asked about again.
 */
export interface ResultTasksDroppedBody {
  error: 'resultTasksDropped'
  confirmation: string
  dogs: DroppedTasksDog[]
}

const isDroppedTasksDog = (value: unknown): value is DroppedTasksDog =>
  isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.tasks === 'number'

export const isResultTasksDroppedBody = (body: unknown): body is ResultTasksDroppedBody =>
  isObject(body) &&
  body.error === 'resultTasksDropped' &&
  typeof body.confirmation === 'string' &&
  Array.isArray(body.dogs) &&
  body.dogs.every(isDroppedTasksDog)

/**
 * Join a class's round to one dog's entries, driven by the round so an unscored task reads as `null`
 * rather than vanishing from the total.
 */
export const toScoredTasks = (
  round: readonly ExerciseSlot[],
  // Provenance is irrelevant to a score, so this accepts a task on its way in as readily as one stored.
  scored: readonly Pick<JsonEventResultTask, 'stationId' | 'index' | 'points'>[] | undefined
): ScoredTask[] =>
  round.map((slot) => ({
    maxPoints: slot.maxPoints,
    points: scored?.find((entry) => holdsScore(slot, entry))?.points ?? null,
    stationId: slot.stationId,
    task: slot.exercise,
  }))

/**
 * The task shape these helpers need. Generic over `updatedAt` because the client holds a `Date`, made
 * at the typed boundary (`lib/wire.ts`), while the server holds the string it stored.
 */
interface StationScopedTask {
  stationId: string
  index: number
  updatedAt: string | Date
  updatedBy: string
}

/** The tasks belonging to one post. */
const stationTasks = <T extends StationScopedTask>(tasks: readonly T[] | undefined, stationId: string): T[] =>
  (tasks ?? []).filter((task) => task.stationId === stationId)

/**
 * The latest write among a post's tasks — the version a station-scoped edit is made against.
 *
 * Provenance is tracked per post rather than per result because posts are scored in parallel. A whole-
 * result version would go stale every time any other post saved, and every station's next save would
 * look like a conflict with work it never touched.
 */
export const stationVersion = <T extends StationScopedTask>(
  tasks: readonly T[] | undefined,
  stationId: string
): T['updatedAt'] | undefined => {
  const own = stationTasks(tasks, stationId)
  if (!own.length) return undefined

  // Compare by instant rather than sorting the raw values: sorting happens to work on ISO strings and
  // not at all on Date objects, which sort by their locale text.
  return own.reduce((latest, task) => (new Date(task.updatedAt) > new Date(latest.updatedAt) ? task : latest), own[0])
    .updatedAt
}

const withoutProvenance = <T extends StationScopedTask>({ updatedAt: _at, updatedBy: _by, ...rest }: T) => rest
const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index

/** Whether two rounds say the same thing about one post, ignoring who recorded it and when. */
export const sameStationTasks = <T extends StationScopedTask>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
  stationId: string
): boolean =>
  !objectsDiffer(
    stationTasks(a, stationId).map(withoutProvenance).sort(byIndex),
    stationTasks(b, stationId).map(withoutProvenance).sort(byIndex)
  )

/**
 * Replace one post's tasks and leave the rest of the round as stored.
 *
 * Posts are scored independently, so a station secretary submitting their own post must not carry away
 * the scores another post already recorded for the same dog.
 */
export const mergeStationTasks = <T extends StationScopedTask>(
  stored: readonly T[] | undefined,
  submitted: readonly T[] | undefined,
  stationId: string
): T[] => [...(stored ?? []).filter((task) => task.stationId !== stationId), ...stationTasks(submitted, stationId)]
