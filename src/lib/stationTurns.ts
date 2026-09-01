import type { JsonStationTurn, StationTurn, StationTurnPause } from '../types'
import type { LiveFlow } from './liveFormat'

/**
 * Derivations over a post's timeline (KOE-1259). Shared between the lambdas and the browser on
 * purpose: the admin view, the tokenized station link and the public start list all measure the same
 * spans with this code, so they cannot disagree.
 *
 * Structural over the span, because the same spans travel as ISO strings (stored, lambda) and as
 * revived `Date`s (browser) — nothing here needs to know who exactly was in a turn, only when it ran
 * and whether it was a break.
 */
export interface StationTurnSpan {
  stationId: string
  startedAt: string | Date
  endedAt?: string | Date
  pause?: StationTurnPause
}

/** The stored span without its registration ids — the only face the public and the link may see. */
export const toPublicStationTurn = <T extends { registrationIds: unknown }>({
  registrationIds: _registrationIds,
  ...publicTurn
}: T) => publicTurn

/** A complete stored span, as opposed to the partial shapes a `Patch` may carry. */
export const isStoredStationTurn = (turn: unknown): turn is JsonStationTurn | StationTurn => {
  if (typeof turn !== 'object' || turn === null) return false
  const candidate = turn as JsonStationTurn | StationTurn
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.stationId === 'string' &&
    (typeof candidate.startedAt === 'string' || candidate.startedAt instanceof Date) &&
    Array.isArray(candidate.dogs) &&
    Array.isArray(candidate.registrationIds)
  )
}

/** A break is a span with a pause code; only dog-carrying spans count toward throughput. */
export const isBreakTurn = (turn: Pick<StationTurnSpan, 'pause'>) => Boolean(turn.pause)

/** The span with no end yet: what the post is doing right now, a turn or a break alike. */
export const openTurn = <T extends StationTurnSpan>(turns: readonly T[], stationId: string): T | undefined =>
  turns.find((turn) => turn.stationId === stationId && !turn.endedAt)

/** The closed, dog-carrying spans of one post — the list every figure below measures. */
export const completedGroupTurns = <T extends StationTurnSpan>(turns: readonly T[], stationId: string): T[] =>
  turns.filter((turn) => turn.stationId === stationId && Boolean(turn.endedAt) && !isBreakTurn(turn))

export const turnDurationMs = (turn: Pick<StationTurnSpan, 'startedAt' | 'endedAt'>): number =>
  new Date(turn.endedAt ?? turn.startedAt).valueOf() - new Date(turn.startedAt).valueOf()

/** How long the open span has been running — the live clock, as opposed to a closed span's length. */
export const turnElapsedMs = (turn: Pick<StationTurnSpan, 'startedAt'>, now: Date = new Date()): number =>
  now.valueOf() - new Date(turn.startedAt).valueOf()

const median = (sorted: readonly number[]): number => {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * A turn nobody closed until much later would land in the mean where it does the most damage, so
 * spans beyond this multiple of the median are left out of the figures (but still counted as run).
 */
const OUTLIER_MEDIAN_MULTIPLE = 3

interface StationThroughput {
  /** Closed group turns the figures are based on, outliers excluded. */
  count: number
  minMs: number
  maxMs: number
  meanMs: number
}

/**
 * Minimum, maximum and mean over one post's closed group turns. Breaks are excluded by construction
 * — they are spans with no dogs — and a forgotten end-mark is guarded against by dropping spans far
 * beyond the median, so the figure participants plan their morning by degrades honestly to "no
 * estimate yet" rather than to a lie.
 */
export const stationThroughput = (
  turns: readonly StationTurnSpan[],
  stationId: string
): StationThroughput | undefined => {
  const durations = completedGroupTurns(turns, stationId)
    .map(turnDurationMs)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)
  if (durations.length === 0) return undefined

  const guard = median(durations) * OUTLIER_MEDIAN_MULTIPLE
  const kept = durations.filter((ms) => ms <= guard)
  if (kept.length === 0) return undefined

  return {
    count: kept.length,
    maxMs: kept[kept.length - 1],
    meanMs: kept.reduce((sum, ms) => sum + ms, 0) / kept.length,
    minMs: kept[0],
  }
}

/**
 * How many dogs a post has actually had through, which is not the number of turns: one walk-up span
 * moves four dogs along. Counted from the closed spans only — the group on the ground has not been
 * through yet.
 */
export const dogsThrough = <T extends StationTurnSpan & { dogs: readonly unknown[] }>(
  turns: readonly T[],
  stationId: string
): number => completedGroupTurns(turns, stationId).reduce((total, turn) => total + turn.dogs.length, 0)

/** A range, because the answer is an estimate and must never read as a promise. */
interface WaitEstimate {
  /** Turns still to run, not dogs — what the range was actually multiplied from. */
  groupsAhead: number
  minMs: number
  maxMs: number
}

/**
 * How long the dogs still queueing at a post will take, from the pace the post has actually kept.
 *
 * Throughput measures a *group*, because a walk-up is one span however many dogs it holds, so the
 * queue is divided by the post's `dogsAtOnce` before it is multiplied. Getting that backwards
 * overstates the wait by exactly that factor — twelve dogs at a post taking four at a time is three
 * turns, not twelve — and a fourfold overstatement is what sends someone home before their turn.
 *
 * Withheld with no figures to go on, and withheld under `field`, where the entry is on the ground
 * rather than waiting to be called and a number of minutes would describe nothing.
 */
export const waitEstimate = (
  throughput: StationThroughput | undefined,
  dogsAhead: number,
  dogsAtOnce: number,
  flow: LiveFlow = 'queue'
): WaitEstimate | undefined => {
  if (flow === 'field' || !throughput || dogsAhead <= 0) return undefined

  const groupsAhead = Math.ceil(dogsAhead / Math.max(1, dogsAtOnce))

  return { groupsAhead, maxMs: groupsAhead * throughput.maxMs, minMs: groupsAhead * throughput.minMs }
}

/** The post ids that have any live spans, in first-seen order — what the live view iterates. */
export const liveStationIds = (turns: readonly Pick<StationTurnSpan, 'stationId'>[]): string[] => [
  ...new Set(turns.map((turn) => turn.stationId)),
]

/** The implicit single post of formats without stations. */
export const IMPLICIT_STATION_ID = '1'
