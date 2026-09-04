import type { TFunction } from 'i18next'
import type { JsonEventStation, LiveMark } from '../types'

/**
 * How an event type runs its day at a post (KOE-1259, phase 4).
 *
 * The live view is one implementation configured per format, and this is the configuration. Event
 * types differ here by *data*, not by code: a format that runs four dogs at once on open ground is a
 * row in the table below, not a branch in the view. That is what lets NOME-A share a screen with NOWT
 * although one records marks and the other scores.
 *
 * Deliberately absent: NKM, because the app has no notion of its format yet, and the tolling trials
 * (NOTO, NOTO-M, in force 1.1.2027), which are not in the app either. Both fall to the default — one
 * post, a queue — which is what they would be given anyway, so neither waits on the other.
 */

/**
 * Whether the entry waits its turn somewhere else, or is already on the ground with the dog running.
 *
 * Under `field` a waiting-time estimate is withheld: "eight dogs ahead of you" describes nothing
 * anyone is doing when the whole entry is walking the same line.
 */
export type LiveFlow = 'queue' | 'field'

/** What one turn at this format's post is a turn *of*. */
type LiveTaskModel =
  /** The post is the unit; its one or two tasks are not separately timed (NOWT). */
  | 'post'
  /**
   * The day at the post is divided into named phases and a turn says which: the format's own fixed
   * list (NOU), or the list the post's secretary writes down for the day (NOME-B).
   */
  | 'phases'
  /** A turn is one retrieve that the whole group attempts (NOME-A). */
  | 'retrieve'
  /** Nothing is recorded at task level; only the result. */
  | 'none'

/**
 * One phase of the day at a post. A fixed phase is named by its key and translated; a post's own
 * phase carries its label as written.
 */
export interface LivePhase {
  key: string
  label?: string
  /** The whole entry attends at once — a briefing — so the span holds no dogs and measures nothing. */
  whole?: boolean
}

interface LiveFormat {
  /** Whether the day rotates between several posts or runs at one implicit post. */
  posts: 'one' | 'many'
  /** Dogs per turn where the format fixes it. Absent leaves it to the post's own form. */
  dogsAtOnce?: number
  flow: LiveFlow
  tasks: LiveTaskModel
  /** The live vocabulary. Empty where a turn records only that the dog ran. */
  marks: readonly LiveMark[]
  /** The fixed phases of the day, where the format has them; absent, a `phases` post names its own. */
  phases?: readonly LivePhase[]
}

/**
 * NOME-A's live facts are marks, not scores, and the vocabulary is the one spoken at the post: the dog
 * is noudossa, and it either sai noudon or ei noutoa. The last two are the judge's calls on top of
 * that — an eye wipe is failing at game another dog retrieves in comparable conditions, a first dog
 * down is marking wounded game and not finding what the judge holds was findable — and neither is
 * derivable from the order of attempts, however plainly the order suggests one.
 */
const NOME_A_MARKS: readonly LiveMark[] = ['onRetrieve', 'gotRetrieve', 'noRetrieve', 'eyeWipe', 'firstDogDown']

/**
 * One post, a queue, nothing recorded but the result. What an unlisted format gets — and it fixes no
 * dog count, so a post that says it takes four is believed rather than quietly forced back to one.
 */
const DEFAULT_LIVE_FORMAT: LiveFormat = { flow: 'queue', marks: [], posts: 'one', tasks: 'none' }

const NOME_A: LiveFormat = { dogsAtOnce: 4, flow: 'field', marks: NOME_A_MARKS, posts: 'one', tasks: 'retrieve' }
/**
 * A taipumuskoe opens with the whole entry at the briefing, then each dog in turn goes to the water
 * mark and from there to the search. What the search records beyond its time is not decided yet.
 */
const NOU_PHASES: readonly LivePhase[] = [{ key: 'briefing', whole: true }, { key: 'waterMark' }, { key: 'search' }]

/** One post, whose phases the post's own secretary writes down, since a B trial's day varies. */
const NOME_B: LiveFormat = { flow: 'queue', marks: [], posts: 'one', tasks: 'phases' }
/** Four or five posts that the classes rotate past; each post's own form says how many dogs. */
const NOWT: LiveFormat = { flow: 'queue', marks: [], posts: 'many', tasks: 'post' }

const LIVE_FORMATS = new Map<string, LiveFormat>([
  ['NOME-A', NOME_A],
  ['NOME-A SM', NOME_A],
  ['NOME-B', NOME_B],
  ['NOME-B SM', NOME_B],
  ['NOU', { dogsAtOnce: 1, flow: 'queue', marks: [], phases: NOU_PHASES, posts: 'one', tasks: 'phases' }],
  ['NOWT', NOWT],
  ['NOWT SM', NOWT],
])

export const liveFormat = (eventType?: string): LiveFormat => LIVE_FORMATS.get(eventType ?? '') ?? DEFAULT_LIVE_FORMAT

/** A whole entry never runs at once; more dogs than this is a malformed request, not a walk-up. */
export const MAX_DOGS_AT_ONCE = 10

/**
 * How many dogs one turn at this post holds.
 *
 * The format's own number wins where it has one — NOME-A is four whatever anyone configures — and
 * otherwise it is the post's own form, which is where a walk-up is described. One when neither says.
 */
export const stationDogsAtOnce = (eventType?: string, station?: Pick<JsonEventStation, 'dogsAtOnce'>): number => {
  const fixed = liveFormat(eventType).dogsAtOnce
  if (fixed) return fixed

  const own = station?.dogsAtOnce ?? 0
  if (own < 1) return 1
  return Math.min(own, MAX_DOGS_AT_ONCE)
}

/** The implicit single post of formats without stations. */
export const IMPLICIT_STATION_ID = '1'

/** A post as either side holds it: the lambdas with the date as a string, the browser as a `Date`. */
type StationOf<D> = Omit<JsonEventStation, 'date'> & { date: D }

interface StationHost<D> {
  eventType: string
  startDate: D
  stations?: StationOf<D>[]
}

/**
 * The post a station id names on this event.
 *
 * One of the event's own where it has any — and then only those, so a NOWT round cannot be scored at
 * a post nobody laid out. A format that runs its one implicit post has nothing stored, so the implicit
 * post is answered for out of thin air with the shape the stations editor would have given it. Once
 * something has written it down (revoking its link does, to have somewhere to keep the version), it is
 * the event's own post from then on and the stored one wins.
 */
export const resolveStation = <D>(event: StationHost<D>, stationId: string): StationOf<D> | undefined => {
  if (event.stations?.length) return event.stations.find((station) => station.id === stationId)
  if (stationId !== IMPLICIT_STATION_ID || liveFormat(event.eventType).posts !== 'one') return undefined
  return { date: event.startDate, id: IMPLICIT_STATION_ID, number: 1, tasks: 1 }
}

/** The fixed phases have translated names; a post's own phase is its label as written. */
const FIXED_PHASE_LABEL_KEYS = {
  briefing: 'liveStatus.phase.briefing',
  search: 'liveStatus.phase.search',
  waterMark: 'liveStatus.phase.waterMark',
} as const

const isFixedPhaseKey = (key: string): key is keyof typeof FIXED_PHASE_LABEL_KEYS => key in FIXED_PHASE_LABEL_KEYS

export const livePhaseLabel = (phase: LivePhase, t: TFunction<'translation'>): string =>
  phase.label ?? (isFixedPhaseKey(phase.key) ? t(FIXED_PHASE_LABEL_KEYS[phase.key]) : phase.key)

/**
 * The phases a turn at this post may name: the format's fixed list where it has one, otherwise what
 * the post's secretary wrote down, and nothing at all where the format has no phases to speak of.
 */
export const stationPhases = (eventType?: string, station?: Pick<JsonEventStation, 'phases'>): LivePhase[] => {
  const format = liveFormat(eventType)
  if (format.tasks !== 'phases') return []
  if (format.phases) return [...format.phases]
  return (station?.phases ?? []).map((label) => ({ key: label, label }))
}
