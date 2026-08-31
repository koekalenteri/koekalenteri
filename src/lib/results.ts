import type {
  EliminatingFault,
  EventResultElimination,
  EventResultRetirement,
  JsonEventClassStation,
  JsonEventResult,
  JsonEventResultTask,
  PublicJudge,
} from '../types'
import { objectsDiffer } from './diff'

/**
 * The result codes shared by every event type. `0` and `-` are different outcomes: `0` says the dog was
 * judged and did not place, `-` says there was no completed round to judge. Both differ again from an
 * absent result, which says nothing has been recorded yet.
 */
export type ResultCode = '1' | '2' | '3' | '0' | '-'

/**
 * Prize thresholds as percentages of the round's maximum (NOWT rules §5.8.1).
 *
 * The rules print these as the absolute points 80 / 65 / 50, but that is the same percentage against a
 * five-post round. Events now commonly run four posts for a maximum of 80, where a dog on 65 points has
 * 81 % and has earned a *first* prize — comparing raw points would score it a second.
 */
const NOWT_PRIZE_THRESHOLD_PERCENT = { 1: 80, 2: 65, 3: 50 } as const

/**
 * A post is always worth 20, whether it sets one task of 20 or two of 10. The rules never state this,
 * so a change of convention stays a change to this one value.
 */
const STATION_MAX_POINTS = 20

/** A post's points split evenly between its tasks, so the parts always add up to the whole. */
export const taskMaxPoints = (tasks: 1 | 2): number => STATION_MAX_POINTS / tasks

/** Event types scored at posts. Everything else is judged qualitatively and has no tasks. */
const POST_SCORED_EVENT_TYPES = ['NOWT', 'NOWT SM']

export const scoresAtPosts = (eventType?: string): boolean => POST_SCORED_EVENT_TYPES.includes(eventType ?? '')

/** Shared by every event type's rules, in the order the lists give them. */
const ELIMINATING_FAULTS: EliminatingFault[] = [
  'aggression',
  'gunShyness',
  'refusedRetrieve',
  'hardMouth',
  'harshHandling',
]

/**
 * The hylkäävät virheet offered when scoring an event type.
 *
 * Only merkkaaminen is scoped so far, because only it is demonstrably one event type's: the rules give
 * it to NOU alone, as the Hakuinto quality of the taipumuskoe (§2.3.2, "Jatkuva reviirin merkkaaminen
 * kertoo puutteellisesta hakuinnosta ja johtaa suorituksen hylkäämiseen"), and NOWT §5.3.5 does not list
 * it. Where the shared list itself diverges from §5.3.5 — refusedRetrieve and harshHandling are not in
 * it, and liiallinen arkuus tai pelokkuus is missing from ours — that is the deferred conformance work,
 * which this deliberately does not decide.
 */
export const eliminatingFaults = (eventType?: string): EliminatingFault[] =>
  eventType === 'NOU' ? [...ELIMINATING_FAULTS, 'marking'] : ELIMINATING_FAULTS

/** One task as scored for one dog, joined to its definition in the class's round. */
export interface ScoredTask {
  stationId: string
  /** The task's nominal maximum. Never the halved figure from an ALO recall. */
  maxPoints: number
  /** `null` while unscored. */
  points: number | null
}

interface NowtResultInput {
  tasks: readonly ScoredTask[]
  elimination?: EventResultElimination
  retirement?: EventResultRetirement
}

/**
 * The most this dog may score on a task. Calling the dog back mid-task halves it in ALO (§10.4).
 *
 * This caps what can be entered, not what the dog is measured against: the percentage stays over the
 * nominal maximum, so the forfeited points are the penalty. Scoring against this reduced ceiling instead
 * would erase the penalty entirely and hand out first prizes the rules disallow.
 */
export const taskEntryCeiling = (task: Pick<JsonEventResultTask, 'recalled'> & { maxPoints: number }): number =>
  task.recalled ? Math.floor(task.maxPoints / 2) : task.maxPoints

/** One scored slot in a class's round. */
export interface RoundTask {
  stationId: string
  /** 0-based position among that post's tasks. */
  index: number
  maxPoints: number
}

/**
 * The scored slots a class runs, in course order.
 *
 * A class follows the course as built unless it has its own entry for a post. Expanding the split here
 * rather than storing each slot means a post's tasks cannot fail to add up to the post.
 */
export const classRound = (
  stations: readonly { id: string; tasks: 1 | 2 }[],
  classStations?: readonly JsonEventClassStation[]
): RoundTask[] =>
  stations.flatMap((station) => {
    const tasks = classStations?.find((entry) => entry.stationId === station.id)?.tasks ?? station.tasks
    const maxPoints = taskMaxPoints(tasks)

    return Array.from({ length: tasks }, (_unused, index) => ({ index, maxPoints, stationId: station.id }))
  })

/**
 * Join a class's round to one dog's entries, driven by the round so an unscored task reads as `null`
 * rather than vanishing from the total.
 */
export const toScoredTasks = (
  round: readonly RoundTask[],
  // Provenance is irrelevant to a score, so this accepts a task on its way in as readily as one stored.
  scored: readonly Pick<JsonEventResultTask, 'stationId' | 'index' | 'points'>[] | undefined
): ScoredTask[] =>
  round.map((task) => ({
    maxPoints: task.maxPoints,
    points: scored?.find((entry) => entry.stationId === task.stationId && entry.index === task.index)?.points ?? null,
    stationId: task.stationId,
  }))

export const nowtTotals = (tasks: readonly ScoredTask[]) => {
  const points = tasks.reduce((sum, task) => sum + (task.points ?? 0), 0)
  const maxPoints = tasks.reduce((sum, task) => sum + task.maxPoints, 0)

  return { maxPoints, percentage: maxPoints ? (points * 100) / maxPoints : 0, points }
}

/**
 * Compare as a ratio rather than a rounded percentage. On a four-post round the thresholds land on whole
 * numbers, but real scores do not — 53 of 80 is 66.25 % — and a dog on 64.6 % displayed as "65 %" must
 * not collect a second prize it did not earn.
 */
const atLeastPercent = (points: number, maxPoints: number, percent: number) => points * 100 >= percent * maxPoints

/**
 * Every post must yield at least half its points for a first prize (§5.8.1). A post worth 20 therefore
 * has a floor of 10, which is what the rules' "(10 pistettä)" states outright. Where a post splits into
 * two tasks the floor applies to their sum, so 9 + 8 clears it although neither task reaches 10.
 */
const everyPostAtLeastHalf = (tasks: readonly ScoredTask[]): boolean => {
  const posts = new Map<string, { points: number; maxPoints: number }>()

  for (const task of tasks) {
    const post = posts.get(task.stationId) ?? { maxPoints: 0, points: 0 }
    post.points += task.points ?? 0
    post.maxPoints += task.maxPoints
    posts.set(task.stationId, post)
  }

  return [...posts.values()].every((post) => post.points * 2 >= post.maxPoints)
}

/**
 * The prize for a round scored at posts.
 *
 * Returns `undefined` while the round is still incomplete, so a half-entered scorecard shows no prize
 * rather than a misleading one.
 *
 * Ordering carries meaning. Elimination and withdrawal *void* the round — there is no performance left
 * to judge — so they settle the result before any scoring runs. Checking the zero rule first would let
 * an early zero override an exclusion, reporting a dog as having failed on merit when it was in fact
 * thrown out.
 */
export const deriveNowtResult = ({ tasks, elimination, retirement }: NowtResultInput): ResultCode | undefined => {
  if (elimination) return '-'
  if (retirement?.cause === 'injury') return '-'
  if (retirement?.cause === 'handlerChoice') return retirement.couldStillHavePlaced ? '-' : '0'

  if (tasks.length === 0 || tasks.some((task) => task.points === null)) return undefined

  // A single zero bars every prize, whatever the total: "jos koira on saanut jostain tehtävästä nolla
  // pistettä, sitä ei voida palkita".
  if (tasks.some((task) => task.points === 0)) return '0'

  const { points, maxPoints } = nowtTotals(tasks)
  if (maxPoints === 0) return '0'

  // The per-post floor gates the first prize only; second and third go on the total alone.
  if (atLeastPercent(points, maxPoints, NOWT_PRIZE_THRESHOLD_PERCENT[1]) && everyPostAtLeastHalf(tasks)) return '1'
  if (atLeastPercent(points, maxPoints, NOWT_PRIZE_THRESHOLD_PERCENT[2])) return '2'
  if (atLeastPercent(points, maxPoints, NOWT_PRIZE_THRESHOLD_PERCENT[3])) return '3'

  return '0'
}

/**
 * Event types judged pass or fail rather than placed. Both still use the shared alphabet — a pass is
 * `1` and a fail `0` — so `NOU1` and `NKM0`, never words.
 */
const PASS_FAIL_EVENT_TYPES = ['NOU', 'NKM']

/**
 * The codes a secretary may record for an event type.
 *
 * Neither pass/fail type offers the dash: their rules (§2.7, §6.7) describe only a pass and a fail, and
 * a dash on a test with nothing to place against would mean nothing.
 */
export const availableResultCodes = (eventType: string): ResultCode[] =>
  PASS_FAIL_EVENT_TYPES.includes(eventType) ? ['1', '0'] : ['1', '2', '3', '0', '-']

/**
 * Results are written as a prefix and a code: `ALO1`, `AVO-`, and for event types without classes
 * `NOU1` or `NKM0`. This is the same class-or-event-type rule `getEventProgress` already applies when
 * it falls back to `[event.eventType]` for an event with no classes.
 */
export const eventResultPrefix = (eventType: string, eventClass?: string): string => eventClass ?? eventType

export const formatEventResult = (code: ResultCode, eventType: string, eventClass?: string): string =>
  `${eventResultPrefix(eventType, eventClass)}${code}`

/** A task as it arrives from a client: provenance is the server's to assign, not the client's to claim. */
export type SubmittedTask = Omit<JsonEventResultTask, 'updatedAt' | 'updatedBy'>

/** What the secretary submits for one dog. Totals are never taken from the client. */
export interface SubmittedEventResult {
  tasks?: JsonEventResultTask[]
  /**
   * The only source of a result for qualitative event types, and an override for NOWT — the rules leave
   * the judge discretion the derivation cannot model.
   */
  resultCode?: ResultCode
  cert?: boolean
  resCert?: boolean
  elimination?: EventResultElimination
  retirement?: EventResultRetirement
  judge?: PublicJudge
  notes?: string
}

interface EventResultContext {
  eventType: string
  eventClass?: string
  stations?: readonly { id: string; tasks: 1 | 2 }[]
  classStations?: readonly JsonEventClassStation[]
}

/**
 * Turn a submission into the result that gets stored, deriving everything derivable.
 *
 * Totals are recomputed here rather than trusted, so the same module decides the prize whether the
 * question is asked by the entry screen as scores are typed or by the server as they are saved. Those
 * two disagreeing is the failure this exists to prevent.
 */
export const resolveEventResult = (
  submitted: SubmittedEventResult,
  { eventType, eventClass, stations = [], classStations }: EventResultContext
): Omit<JsonEventResult, 'updatedAt' | 'updatedBy'> => {
  const { tasks, resultCode, ...rest } = submitted
  const voided = Boolean(submitted.elimination) || Boolean(submitted.retirement)

  if (!scoresAtPosts(eventType)) {
    // Nothing to derive: a qualitative type is whatever the judge decided.
    return {
      ...rest,
      ...(resultCode ? { result: formatEventResult(resultCode, eventType, eventClass) } : {}),
    }
  }

  const scored = toScoredTasks(classRound(stations, classStations), tasks)
  const code = resultCode ?? deriveNowtResult({ ...submitted, tasks: scored })

  // A voided round has no total worth publishing: two thirds of a round is not a worse performance
  // than a whole one, and a percentage beside dogs who ran everything invites the wrong comparison.
  const totals = voided ? undefined : nowtTotals(scored)

  return {
    ...rest,
    ...(tasks ? { tasks } : {}),
    ...(totals ? { maxPoints: totals.maxPoints, percentage: totals.percentage, points: totals.points } : {}),
    ...(code ? { result: formatEventResult(code, eventType, eventClass) } : {}),
  }
}

/**
 * Whether two stored results say the same thing about the dog.
 *
 * `updatedAt` and `updatedBy` record who wrote it down and when, not what happened, so they are left
 * out: a retry that lands after the first attempt already succeeded must read as the same result, not
 * as a competing one.
 */
export const sameEventResult = (a?: JsonEventResult, b?: JsonEventResult): boolean => {
  if (!a || !b) return a === b

  // Strip provenance from the tasks as well as the result. A resubmission is stamped afresh before it
  // is compared, so leaving the task stamps in would make every retry look like a new result.
  const bare = ({ updatedAt: _at, updatedBy: _by, tasks, ...rest }: JsonEventResult) => ({
    ...rest,
    ...(tasks ? { tasks: tasks.map(({ updatedAt: _a, updatedBy: _b, ...task }) => task) } : {}),
  })

  return !objectsDiffer(bare(a), bare(b))
}

/**
 * The task shape these helpers need. Generic over `updatedAt` because the client holds a `Date` — `http`
 * revives any ISO string by the value's own shape — while the server holds the string it stored.
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
  return own.reduce((latest, task) => (new Date(task.updatedAt) > new Date(latest.updatedAt) ? task : latest)).updatedAt
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
