import type { EventResultRetirement, JsonEventClassStation, JsonEventResultTask, NowtEliminatingFault } from '../types'

/**
 * The result codes shared by every event type. `0` and `-` are different outcomes: `0` says the dog was
 * judged and did not place, `-` says there was no completed round to judge. Both differ again from an
 * absent result, which says nothing has been recorded yet.
 */
type ResultCode = '1' | '2' | '3' | '0' | '-'

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
  eliminatedBy?: NowtEliminatingFault
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
interface RoundTask {
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
  scored: readonly JsonEventResultTask[] | undefined
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
export const deriveNowtResult = ({ tasks, eliminatedBy, retirement }: NowtResultInput): ResultCode | undefined => {
  if (eliminatedBy) return '-'
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
