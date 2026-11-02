import type {
  EventResultRetirement,
  JsonEventResultTask,
  LegacyEventResultTask,
  PublicJudge,
  StationVisitLayout,
  StoredEventResultTask,
} from '../types'
import type { SortableRegistration } from './registration'
import type { RotationDog, RotationEvent } from './rotation'
import { objectsDiffer } from './diff'
import { dogVisits, rotationDogOf } from './rotation'
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
 * A score is stored at its exercise number and part (`JsonEventResultTask`), the address the results
 * table's "Rasti n" and the post's link enter it against, so it stays with its exercise whatever the posts
 * or the running order become. The post, the maximum and the judges are read off the dog's running order.
 */
export interface ExerciseSlot {
  /** The post the dog's group does the exercise at. */
  stationId: string
  /**
   * The slot's place among the group's slots at the post, the parts of its exercises there counted in
   * exercise order: the address a score stored before KOE-1665 carries (`LegacyEventResultTask.index`),
   * read only by `exerciseTaskOf`. A post stored with `tasks: 2` is one exercise in two parts.
   */
  legacyIndex: number
  /** The exercise's number in the dog's running order, from 1. */
  exercise: number
  /** 0-based part of the exercise. */
  part: number
  /** The parts the exercise splits into. */
  parts: 1 | 2
  maxPoints: number
}

/**
 * The scored slots of one visit to a post: its exercise, whole or in parts. Expanding the split here
 * rather than storing each slot means an exercise's parts cannot fail to add up to it.
 */
export const visitSlots = (
  stationId: string,
  { exercise, parts, slotsBefore }: Pick<StationVisitLayout, 'exercise' | 'parts' | 'slotsBefore'>
): ExerciseSlot[] =>
  Array.from({ length: parts }, (_unused, part) => ({
    exercise,
    legacyIndex: slotsBefore + part,
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

/** The exercises a dog's group does at a post, by number, from its posts in exercise order. */
export const exercisesAtPost = (exercisePosts: readonly string[], stationId: string): number[] =>
  exercisePosts.flatMap((post, at) => (post === stationId ? [at + 1] : []))

/**
 * The exercises a dog's group does at a post (`exercisesAtPost`), from the dog's round: a post's save and
 * its view are scoped to these.
 */
export const stationExercises = (event: RotationEvent, registration: SortableRegistration, stationId: string) =>
  exercisesAtPost(exercisePostsOf(dogRound(event, rotationDogOf(registration))), stationId)

/**
 * The exercise a dog's round ended at (KOE-1669), where the round is scored by exercise: the stored
 * exercise while the round has it (KOE-1665). A place stored with its post alone, before the exercise was
 * stored, is the last exercise at that post, so nothing stored reads as ending earlier than it can have.
 * None where the round did not end early, where the place is not recorded ("Ei tiedossa"), or where the
 * place is not in the round.
 */
export const endedAtExercise = (
  place: Pick<EventResultRetirement, 'stationId' | 'exercise'> | undefined,
  exercisePosts: readonly string[]
): number | undefined => {
  const { stationId, exercise } = place ?? {}
  if (exercise !== undefined && exercise <= exercisePosts.length) return exercise
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

/** The address of a score: its exercise number and part. */
type TaskAddress = Pick<JsonEventResultTask, 'exercise' | 'part'>

/** The address of a score stored before KOE-1665: its post and its slot there. */
type LegacyAddress = Pick<LegacyEventResultTask, 'stationId' | 'index'>

/** A score in either address, as stored or as a page sent it before the release that stored by exercise. */
type AnyAddress = Partial<TaskAddress & LegacyAddress>

/** A score, its address by exercise. */
type Addressed<T> = Omit<T, keyof AnyAddress> & TaskAddress

const addressKey = ({ exercise, part }: TaskAddress): string => `${exercise}#${part}`

/** Whether a dog's slot holds this score. */
export const holdsScore = (slot: TaskAddress, task: TaskAddress): boolean =>
  slot.exercise === task.exercise && slot.part === task.part

/**
 * A score by its exercise (KOE-1665, Jukka 2.11.2026). A score stored before the exercise was stored is
 * read through the dog's round of the layout it was stored under: the slot with its post and its place
 * there gives the exercise and the part. Undefined for one that round does not have.
 */
export const exerciseTaskOf = <T extends AnyAddress>(
  round: readonly ExerciseSlot[],
  task: T
): Addressed<T> | undefined => {
  const { exercise, part, stationId, index, ...rest } = task
  if (exercise !== undefined) return { ...rest, exercise, part: part ?? 0 }
  const slot = round.find((item) => item.stationId === stationId && item.legacyIndex === index)
  return slot ? { ...rest, exercise: slot.exercise, part: slot.part } : undefined
}

/** Whether a stored score is addressed by its exercise, as every score written since KOE-1665 is. */
export const isExerciseTask = (task: StoredEventResultTask): task is JsonEventResultTask => 'exercise' in task

/** Whether a score was stored by its post, before the exercise was stored. */
const isLegacyTask = (task: AnyAddress): boolean => task.exercise === undefined

/** The later of two writes. A `Date` on the client, the ISO string it was stored as on the server. */
const writtenLater = (a: { updatedAt?: string | Date }, b: { updatedAt?: string | Date }): boolean =>
  new Date(a.updatedAt ?? 0).getTime() > new Date(b.updatedAt ?? 0).getTime()

type StoredTaskLike = AnyAddress & { updatedAt?: string | Date }

/** Each score the round holds beside its address there, in stored order, and the ones it cannot hold. */
const addressPairs = <T extends StoredTaskLike>(round: readonly ExerciseSlot[], tasks: readonly T[] | undefined) => {
  const placed = new Map<string, T>()
  const addresses = new Map<T, Addressed<T>>()
  const dropped: T[] = []
  for (const task of tasks ?? []) {
    const addressed = exerciseTaskOf(round, task)
    if (!addressed) {
      dropped.push(task)
      continue
    }
    const key = addressKey(addressed)
    const other = placed.get(key)
    if (other && !writtenLater(task, other)) {
      dropped.push(task)
      continue
    }
    if (other) {
      dropped.push(other)
      addresses.delete(other)
    }
    placed.set(key, task)
    addresses.set(task, addressed)
  }
  const kept = (tasks ?? []).flatMap((task) => {
    const addressed = addresses.get(task)
    return addressed ? [{ addressed, task }] : []
  })
  return { dropped, kept }
}

/**
 * The scores of a round by exercise, against the layout they were stored under, and the ones it cannot
 * hold: a score of a slot the round does not have, and where two scores read as one exercise and part (a
 * score stored by post beside one written by exercise, say), the one recorded first.
 */
export const addressTasks = <T extends StoredTaskLike>(
  round: readonly ExerciseSlot[],
  tasks: readonly T[] | undefined
): { kept: Addressed<T>[]; dropped: T[] } => {
  const { kept, dropped } = addressPairs(round, tasks)
  return { dropped, kept: kept.map(({ addressed }) => addressed) }
}

/**
 * Whether a stored task records anything. The results table stores a slot it shows as unscored
 * (`points: null`) as soon as the row is edited, so a task without points, a zero's reason or a recall
 * is an empty field, and dropping it loses nothing the secretary would need to be asked about.
 */
export const isRecordedTask = (task: Pick<JsonEventResultTask, 'points' | 'recalled' | 'zeroFault'>): boolean =>
  task.points !== null || Boolean(task.zeroFault) || Boolean(task.recalled)

/** A round's slots by exercise and part. */
const slotsByAddress = (round: readonly ExerciseSlot[]) => new Map(round.map((slot) => [addressKey(slot), slot]))

/**
 * Whether a dog's round scores differently after a change of the posts, the rotation or the classes
 * (KOE-1666): another number of exercises, or an exercise split another way. A score stays with its
 * exercise, so which post does an exercise, and in which order the posts come, is no difference.
 */
export const roundsDiffer = (before: readonly ExerciseSlot[], after: readonly ExerciseSlot[]): boolean => {
  if (before.length !== after.length) return true
  const next = slotsByAddress(after)
  return before.some((slot) => next.get(addressKey(slot))?.parts !== slot.parts)
}

/**
 * The stored scores a new round keeps, and the ones it drops (KOE-1666, KOE-1665). Each is read by its
 * exercise against the round it was stored under (`addressTasks`), and kept where the new round has its
 * exercise split the same way: an exercise taken off the running order, or split another way, drops its
 * scores. A new order of the posts or another post for an exercise drops nothing. The event save asks
 * about the recorded ones before it writes.
 */
export const reconcileRoundTasks = <T extends StoredTaskLike>(
  before: readonly ExerciseSlot[],
  after: readonly ExerciseSlot[],
  tasks: readonly T[] | undefined
): { kept: Addressed<T>[]; dropped: T[] } => {
  const previous = slotsByAddress(before)
  const next = slotsByAddress(after)
  const { kept: read, dropped } = addressPairs(before, tasks)
  const kept: Addressed<T>[] = []
  for (const { addressed, task } of read) {
    const key = addressKey(addressed)
    const parts = next.get(key)?.parts
    if (parts !== undefined && parts === (previous.get(key)?.parts ?? parts)) kept.push(addressed)
    else dropped.push(task)
  }
  return { dropped, kept }
}

/**
 * Whether the scores or the stop stored by post before KOE-1665 read as other exercises in the new round
 * than in the one they were stored under: four posts corrected to three, say, where the fourth post's
 * score is exercise 4 only in the old layout. Such a dog is written by exercise before the layout
 * changes; any other change leaves it to be read through its stored layout as before.
 */
export const legacyReadChanges = (
  before: readonly ExerciseSlot[],
  after: readonly ExerciseSlot[],
  result: { tasks?: readonly AnyAddress[]; retirement?: StopPlace; elimination?: StopPlace } | undefined
): boolean => {
  const addressOf = (round: readonly ExerciseSlot[], task: AnyAddress) => {
    const addressed = exerciseTaskOf(round, task)
    return addressed ? addressKey(addressed) : undefined
  }
  const taskMoves = (result?.tasks ?? []).some(
    (task) => isLegacyTask(task) && addressOf(before, task) !== addressOf(after, task)
  )
  const stopMoves = [result?.retirement, result?.elimination].some(
    (place) =>
      isLegacyStop(place) &&
      endedAtExercise(place, exercisePostsOf(before)) !== endedAtExercise(place, exercisePostsOf(after))
  )
  return taskMoves || stopMoves
}

/** Where a round ended, as a stop or an elimination stores it. */
type StopPlace = Pick<EventResultRetirement, 'stationId' | 'exercise'>

/** Whether a round scored by exercise stores where it ended by post alone, as it did before KOE-1665. */
export const isLegacyStop = (place: StopPlace | undefined): boolean =>
  Boolean(place?.stationId) && place?.exercise === undefined

/**
 * Where a round scored by exercise ended, by its exercise: a place stored by post alone read as the last
 * exercise at that post in the round it was stored under, and no place where that round does not have
 * the post. A place stored by exercise is returned as it is, without a post.
 */
export const exerciseStopOf = <P extends StopPlace>(
  place: P,
  round: readonly ExerciseSlot[]
): Omit<P, 'stationId' | 'exercise'> & { exercise?: number } => {
  const { stationId: _post, exercise: _exercise, ...rest } = place
  const exercise = endedAtExercise(place, exercisePostsOf(round))
  return exercise === undefined ? rest : { ...rest, exercise }
}

/**
 * How many exercises of a round some scores are of: the parts of one exercise count once, and a score the
 * round does not read counts on its own. What the secretary is told of dropped scores is exercises.
 */
export const exercisesScored = (round: readonly ExerciseSlot[], tasks: readonly AnyAddress[]): number =>
  new Set(
    tasks.map((task) => {
      const addressed = exerciseTaskOf(round, task)
      return addressed ? `exercise ${addressed.exercise}` : `post ${task.stationId}#${task.index}`
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
  scored: readonly Pick<JsonEventResultTask, 'exercise' | 'part' | 'points'>[] | undefined
): ScoredTask[] =>
  round.map((slot) => ({
    maxPoints: slot.maxPoints,
    points: scored?.find((entry) => holdsScore(slot, entry))?.points ?? null,
    stationId: slot.stationId,
    task: slot.exercise,
  }))

/**
 * The judge of a score: one of the judges of the post where the dog's group does the exercise. The stored
 * judge picks which of them, while it is one; where the exercise has moved to another post since, the
 * post's first judge stands for it. A post naming no judges leaves the stored one.
 */
export const effectiveJudge = (
  task: Pick<JsonEventResultTask, 'judge'>,
  postJudges: readonly PublicJudge[]
): PublicJudge | undefined => {
  const { judge } = task
  if (postJudges.length === 0) return judge
  const same = (other: PublicJudge) =>
    judge !== undefined && (judge.id === undefined ? other.name === judge.name : other.id === judge.id)
  return postJudges.find(same) ?? postJudges[0]
}

/**
 * The task shape these helpers need. Generic over `updatedAt` because the client holds a `Date`, made
 * at the typed boundary (`lib/wire.ts`), while the server holds the string it stored.
 */
interface StationScopedTask extends TaskAddress {
  updatedAt: string | Date
  updatedBy: string
}

/**
 * The tasks belonging to one post: the exercises the dog's group does there (`exercisesAtPost`). A post
 * the group comes to twice holds both exercises.
 */
const stationTasks = <T extends StationScopedTask>(
  tasks: readonly T[] | undefined,
  exercises: readonly number[]
): T[] => (tasks ?? []).filter((task) => exercises.includes(task.exercise))

/**
 * The latest write among a post's tasks — the version a station-scoped edit is made against.
 *
 * Provenance is tracked per post rather than per result because posts are scored in parallel. A whole-
 * result version would go stale every time any other post saved, and every station's next save would
 * look like a conflict with work it never touched.
 */
export const stationVersion = <T extends StationScopedTask>(
  tasks: readonly T[] | undefined,
  exercises: readonly number[]
): T['updatedAt'] | undefined => {
  const own = stationTasks(tasks, exercises)
  if (!own.length) return undefined

  // Compare by instant rather than sorting the raw values: sorting happens to work on ISO strings and
  // not at all on Date objects, which sort by their locale text.
  return own.reduce((latest, task) => (writtenLater(task, latest) ? task : latest), own[0]).updatedAt
}

const withoutProvenance = <T extends StationScopedTask>({ updatedAt: _at, updatedBy: _by, ...rest }: T) => rest
const byAddress = (a: TaskAddress, b: TaskAddress) => a.exercise - b.exercise || a.part - b.part

/** Whether two rounds say the same thing about one post, ignoring who recorded it and when. */
export const sameStationTasks = <T extends StationScopedTask>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
  exercises: readonly number[]
): boolean =>
  !objectsDiffer(
    stationTasks(a, exercises).map(withoutProvenance).sort(byAddress),
    stationTasks(b, exercises).map(withoutProvenance).sort(byAddress)
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
  exercises: readonly number[]
): T[] => [
  ...(stored ?? []).filter((task) => !exercises.includes(task.exercise)),
  ...stationTasks(submitted, exercises),
]
