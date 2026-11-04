import type {
  EventResultElimination,
  EventResultRetirement,
  EventStation,
  JsonEventResult,
  JsonEventResultTask,
  PublicJudge,
  StationVisitLayout,
} from '../types'
import type { SortableRegistration } from './registration'
import type { RotationDog, RotationEvent, RotationStation } from './rotation'
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
  { exercise, parts }: Pick<StationVisitLayout, 'exercise' | 'parts'>
): ExerciseSlot[] =>
  Array.from({ length: parts }, (_unused, part) => ({
    exercise,
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
 * exercise while the round has it (KOE-1665). None where the round did not end early, where the place is
 * not recorded ("Ei tiedossa"), or where the round no longer has that exercise.
 */
export const endedAtExercise = (
  place: Pick<EventResultRetirement, 'exercise'> | undefined,
  exercisePosts: readonly string[]
): number | undefined => {
  const exercise = place?.exercise
  return exercise !== undefined && exercise <= exercisePosts.length ? exercise : undefined
}

/**
 * Whether a round's ending is not for a post doing these exercises to set (KOE-1615): one is recorded and
 * names none of them. That covers an ending at another post, one without a place ("Ei tiedossa"), and one
 * at an exercise the dog's round no longer has, which a change of layout leaves behind. The last two have
 * no post, so only the event secretary changes them.
 */
export const outcomeHeldElsewhere = (
  result:
    | { elimination?: Pick<EventResultElimination, 'exercise'>; retirement?: Pick<EventResultRetirement, 'exercise'> }
    | undefined,
  exercises: readonly number[]
): boolean =>
  [result?.elimination, result?.retirement].some(
    (place) => place && (place.exercise === undefined || !exercises.includes(place.exercise))
  )

/**
 * Whether a dog's round ended at an exercise before this one, so the dog never reached it and it reads
 * "kesk" (KOE-1669). The exercise it ended at is still entered.
 */
export const endedBefore = (
  retirement: Pick<EventResultRetirement, 'exercise'> | undefined,
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

const addressKey = ({ exercise, part }: TaskAddress): string => `${exercise}#${part}`

/** Whether a dog's slot holds this score. */
export const holdsScore = (slot: TaskAddress, task: TaskAddress): boolean =>
  slot.exercise === task.exercise && slot.part === task.part

/** The later of two writes. A `Date` on the client, the ISO string it was stored as on the server. */
export const writtenLater = (a: { updatedAt?: string | Date }, b: { updatedAt?: string | Date }): boolean =>
  new Date(a.updatedAt ?? 0).getTime() > new Date(b.updatedAt ?? 0).getTime()

/**
 * Whether a stored task records anything. The results table stores a slot it shows as unscored
 * (`points: null`) as soon as the row is edited, so a task without points, a zero's reason or a recall
 * is an empty field, and dropping it loses nothing the secretary would need to be asked about.
 */
export const isRecordedTask = (task: Pick<JsonEventResultTask, 'points' | 'recalled' | 'zeroFault'>): boolean =>
  task.points !== null || Boolean(task.zeroFault) || Boolean(task.recalled)

/** How each exercise and part of a round is split, by address. */
const partsByAddress = (round: readonly ExerciseSlot[]) => new Map(round.map((slot) => [addressKey(slot), slot.parts]))

/**
 * Whether a score at an address reads the same in the new round as in the old: the new round has its
 * exercise and part, split the same way. An address the old round lacks never reads the same.
 */
const readsTheSame = (before: readonly ExerciseSlot[], after: readonly ExerciseSlot[]) => {
  const was = partsByAddress(before)
  const now = partsByAddress(after)
  return (address: TaskAddress) => {
    const parts = now.get(addressKey(address))
    return parts !== undefined && parts === was.get(addressKey(address))
  }
}

/**
 * Whether a dog's round scores differently after a change of the posts, the rotation or the classes
 * (KOE-1666): another number of exercises, or an exercise split another way. A score stays with its
 * exercise, so which post does an exercise, and in which order the posts come, is no difference.
 */
export const roundsDiffer = (before: readonly ExerciseSlot[], after: readonly ExerciseSlot[]): boolean =>
  before.length !== after.length || !before.every(readsTheSame(before, after))

/**
 * The stored scores a new round keeps, and the ones it drops (KOE-1666, KOE-1665): a score stays where
 * the new round has its exercise and part, split the same way as before. An exercise taken off the
 * running order, or split another way, drops its scores; a new order of the posts, or another post for
 * an exercise, drops nothing. The event save asks about the recorded ones before it writes.
 */
export const reconcileRoundTasks = <T extends TaskAddress>(
  before: readonly ExerciseSlot[],
  after: readonly ExerciseSlot[],
  tasks: readonly T[] | undefined
): { kept: T[]; dropped: T[] } => {
  const keeps = readsTheSame(before, after)
  const kept: T[] = []
  const dropped: T[] = []
  for (const task of tasks ?? []) (keeps(task) ? kept : dropped).push(task)
  return { dropped, kept }
}

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
  }))

/**
 * The judge of a score: one of the judges of the post where the dog's group does the exercise. The stored
 * judge picks which of them, while it is one; where the exercise has moved to another post since, the
 * post's first judge stands for it. A post naming no judges leaves the stored one. A score with no judge
 * yet takes the one carried over from the dog before (`carried`), or the post's first.
 */
export const effectiveJudge = (
  task: Pick<JsonEventResultTask, 'judge'> | undefined,
  postJudges: readonly PublicJudge[],
  carried?: PublicJudge
): PublicJudge | undefined => {
  const judge = task?.judge
  if (!judge) return carried ?? postJudges[0]
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
export const stationTasks = <T extends Pick<StationScopedTask, 'exercise'>>(
  tasks: readonly T[] | undefined,
  exercises: readonly number[]
): T[] => (tasks ?? []).filter((task) => exercises.includes(task.exercise))

/** What a score says, on its way in or as stored: its address, and all but who recorded it and when. */
type TaskRecord = TaskAddress & Pick<JsonEventResultTask, 'judge' | 'points' | 'recalled' | 'zeroFault'>

/** Whether a task says what the stored one at its address says. A blank says the same as nothing stored. */
const saysTheSame = (task: TaskRecord, stored: TaskRecord | undefined): boolean => {
  if (!isRecordedTask(task)) return !stored || !isRecordedTask(stored)
  return (
    task.points === stored?.points &&
    task.zeroFault === stored.zeroFault &&
    Boolean(task.recalled) === Boolean(stored.recalled) &&
    (task.judge?.id ?? task.judge?.name) === (stored.judge?.id ?? stored.judge?.name)
  )
}

/**
 * What a post's save leaves behind of an edit (KOE-1696): the tasks at exercises the post does not do that
 * say something other than what is stored. A post's save may not hold those, so they stay unsaved until a
 * save of the whole round. An address the edit does not hold says nothing.
 */
export const heldTasks = <T extends TaskRecord>(
  tasks: readonly T[],
  stored: readonly TaskRecord[] | undefined,
  exercises: readonly number[]
): T[] =>
  tasks.filter(
    (task) =>
      !exercises.includes(task.exercise) &&
      !saysTheSame(
        task,
        stored?.find((entry) => holdsScore(task, entry))
      )
  )

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

/**
 * A result with each score's judge read off the event as it stands (`effectiveJudge`, KOE-1665): one of
 * the judges of the post where the dog's group does the exercise, the stored judge picking which. What is
 * sent to Kennelliitto names these, so editing a post's judges after a send changes the body sent.
 */
export const withEffectiveJudges = <T extends SortableRegistration & { eventResult?: JsonEventResult }>(
  event: Omit<RotationEvent, 'stations'> & { stations?: readonly (RotationStation & Pick<EventStation, 'judges'>)[] },
  registration: T
): T => {
  const tasks = registration.eventResult?.tasks
  if (!registration.eventResult || !tasks?.length) return registration
  const round = dogRound(event, rotationDogOf(registration))
  const judgesAt = (exercise: number) => {
    const stationId = round.find((slot) => slot.exercise === exercise)?.stationId
    return event.stations?.find((station) => station.id === stationId)?.judges ?? []
  }
  const judged = tasks.map(({ judge: stored, ...task }) => {
    const judge = effectiveJudge({ judge: stored }, judgesAt(task.exercise))
    return judge ? { ...task, judge } : task
  })
  return { ...registration, eventResult: { ...registration.eventResult, tasks: judged } }
}
