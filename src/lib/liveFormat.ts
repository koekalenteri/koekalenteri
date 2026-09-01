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
  /** A class takes the post's tasks in an order of its own, so a turn names which (NOME-B). */
  | 'ordered'
  /** Every dog runs the same tasks in the same order, so a turn names nothing (NOU). */
  | 'fixed'
  /** A turn is one retrieve that the whole group attempts (NOME-A). */
  | 'retrieve'
  /** Nothing is recorded at task level; only the result. */
  | 'none'

interface LiveFormat {
  /** Whether the day rotates between several posts or runs at one implicit post. */
  posts: 'one' | 'many'
  /** Dogs per turn where the format fixes it. Absent leaves it to the post's own form. */
  dogsAtOnce?: number
  flow: LiveFlow
  tasks: LiveTaskModel
  /** The live vocabulary. Empty where a turn records only that the dog ran. */
  marks: readonly LiveMark[]
  /**
   * Whether a judge may stop a dog's trial short of an eliminating fault — NOME-A's two serious
   * faults. Such a stop publishes as an interruption rather than as the dash an elimination takes.
   */
  interruption?: boolean
}

/**
 * NOME-A's live facts are marks, not scores: what the dog was sent for and whether it came back with
 * it. The last two are the judge's calls on top of that — an eye-wipe is failing at game another dog
 * retrieves in comparable conditions, a first dog down is marking wounded game and not finding what
 * the judge holds was findable — and neither is derivable from the order of attempts.
 */
const NOME_A_MARKS: readonly LiveMark[] = ['sent', 'found', 'notFound', 'eyeWipe', 'firstDogDown']

/**
 * One post, a queue, nothing recorded but the result. What an unlisted format gets — and it fixes no
 * dog count, so a post that says it takes four is believed rather than quietly forced back to one.
 */
const DEFAULT_LIVE_FORMAT: LiveFormat = { flow: 'queue', marks: [], posts: 'one', tasks: 'none' }

const NOME_A: LiveFormat = {
  dogsAtOnce: 4,
  flow: 'field',
  interruption: true,
  marks: NOME_A_MARKS,
  posts: 'one',
  tasks: 'retrieve',
}
/** One post, but how many dogs at once is the task's — a pair task is two, the rest one. */
const NOME_B: LiveFormat = { flow: 'queue', marks: [], posts: 'one', tasks: 'ordered' }
/** Four or five posts that the classes rotate past; each post's own form says how many dogs. */
const NOWT: LiveFormat = { flow: 'queue', marks: [], posts: 'many', tasks: 'post' }

const LIVE_FORMATS = new Map<string, LiveFormat>([
  ['NOME-A', NOME_A],
  ['NOME-A SM', NOME_A],
  ['NOME-B', NOME_B],
  ['NOME-B SM', NOME_B],
  ['NOU', { dogsAtOnce: 1, flow: 'queue', marks: [], posts: 'one', tasks: 'fixed' }],
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

/** Whether a turn at this post has to say which of the post's tasks it ran. */
export const turnNamesTask = (eventType?: string, station?: Pick<JsonEventStation, 'tasks'>): boolean =>
  liveFormat(eventType).tasks === 'ordered' && (station?.tasks ?? 1) > 1
