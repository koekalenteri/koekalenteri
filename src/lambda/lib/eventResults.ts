import type { SubmittedEventResult, SubmittedTask } from '../../lib/results'
import type { ExerciseSlot, ResultTasksDroppedBody } from '../../lib/resultTasks'
import type {
  EventResultElimination,
  EventResultRetirement,
  JsonConfirmedEvent,
  JsonEventResult,
  JsonEventResultTask,
  JsonRegistration,
  Patch,
  PublicJudge,
} from '../../types'
import { createHash } from 'node:crypto'
import { resultRecomputedAudit, resultSavedAudit } from '../../lib/audit'
import { objectsDiffer } from '../../lib/diff'
import { formatTypeOf } from '../../lib/event'
import { makeArray } from '../../lib/judge'
import { isResultsLocked } from '../../lib/kennelliittoResults'
import { scoresAtPosts } from '../../lib/liveFormat'
import { getRegistrationPlacement, isScorableRegistration } from '../../lib/registration'
import {
  availableResultCodes,
  eliminatingFaults,
  nowtZeroFaults,
  resolveEventResult,
  sameEventResult,
  shownEventResult,
  taskEntryCeiling,
} from '../../lib/results'
import {
  dogRound,
  editVersion,
  exercisePostsOf,
  holdsScore,
  isRecordedTask,
  mergeStationTasks,
  outcomeDiffers,
  outcomeExercises,
  outcomeHeldElsewhere,
  reconcileRoundTasks,
  roundsDiffer,
  sameStationTasks,
  stampTasks,
  stationExercises,
} from '../../lib/resultTasks'
import { rotationDogOf, roundInputsOf } from '../../lib/rotation'
import { mapWithConcurrency } from '../../lib/utils'
import { isConditionalCheckFailure } from './api-gw'
import { audit, registrationAuditKey } from './audit'
import { RESULTS_WRITE_ATTEMPTS, retryOnConditionFailure } from './conditionalWrite'
import { getEvent } from './event'
import { parseJSONWithFallback } from './json'
import { httpError, LambdaError } from './lambda'
import { readEventRegistrations, readRegistration, writeEventResult } from './repositories/registrationRepository'

/** The outcome dropdown's Finnish labels, for the audit line (KOE-1284). */
const ELIMINATING_FAULT_TEXT: Record<EventResultElimination['fault'], string> = {
  aggression: 'aggressiivinen käyttäytyminen',
  chasedUnshotGame: 'ampumattoman riistan takaa-ajaminen',
  excessiveShyness: 'liiallinen arkuus tai pelokkuus',
  gunShyness: 'laukausarkuus',
  hardMouth: 'riistan vahingoittaminen',
  harshHandling: 'koiran kurittaminen koepaikalla',
  huntingWithGame: 'metsästäminen riista suussa',
  lacksCooperation: 'puutteellinen yhteistyö',
  lacksIndependence: 'puutteellinen itseluottamus',
  marking: 'merkkaaminen',
  noDrive: 'riittämätön työskentelyhalu',
  noise: 'vinkuminen tai haukkuminen',
  outOfControl: 'karkaaminen ohjaajan hallinnasta',
  overExcitement: 'ylikiihkeys',
  physicalContact: 'fyysinen kosketus koiraan',
  refusedGame: 'kieltäytyminen riistasta tai noudon jättäminen kesken',
  refusedRetrieve: 'kieltäytyminen noudosta',
  refusedWater: 'kieltäytyminen vesityöskentelystä',
  swappedGame: 'riistan vaihtaminen',
  unauthorizedRun: 'luvaton lähtö noutoon',
}

const RETIREMENT_CAUSE_TEXT: Record<EventResultRetirement['cause'], string> = {
  handlerChoice: 'ohjaaja keskeytti',
  illness: 'koira sairastui',
  injury: 'koira loukkaantui',
  judgeStopped: 'tuomari keskeytti kokeen',
}

/**
 * What the audit line says was saved: the result, the points, and the outcome extra info — the
 * secretary must be able to read back from the trail what they entered (KOE-1284). The sentence
 * around it is translated (KOE-1442); the fault and retirement names inside it are still Finnish.
 */
const auditResultText = (eventResult: JsonEventResult, eventType: string, eventClass?: string): string => {
  const parts: string[] = []
  // As the secretary chose it and KoiraNet lists it, `A1` rather than the stored `NOME-A1` (KOE-1592).
  const shown = shownEventResult(eventResult.result, eventType, eventClass)
  if (shown) parts.push(shown)
  if (typeof eventResult.points === 'number') {
    parts.push(eventResult.maxPoints ? `${eventResult.points}/${eventResult.maxPoints} p` : `${eventResult.points} p`)
  }
  if (eventResult.elimination) {
    parts.push(`hylkäävä virhe: ${ELIMINATING_FAULT_TEXT[eventResult.elimination.fault]}`)
  }
  if (eventResult.retirement) parts.push(RETIREMENT_CAUSE_TEXT[eventResult.retirement.cause])
  if (eventResult.notes) parts.push(eventResult.notes)
  return parts.join(', ')
}

interface ResultSubmission {
  id: string
  eventResult: Omit<SubmittedEventResult, 'tasks'> & { tasks?: SubmittedTask[] }
  /**
   * Scopes the submission to one post. A station secretary scores their own post while the others are
   * being scored in parallel, so their save replaces that post's tasks and leaves the rest of the round
   * as stored. Absent for the event secretary's whole-round view.
   */
  stationId?: string
  /**
   * The version this edit was made against, so a second writer can be told apart from the same writer
   * trying again. Scoped to the post when `stationId` is set — a whole-result version would go stale
   * every time any other post saved. Absent when the client believed nothing was stored yet.
   */
  basedOn?: string
}

/**
 * What is stored for a dog after this request.
 *
 * Returned rather than left for the client to guess, because a station secretary correcting a dog they
 * just scored has nothing else to go on: the next save needs the version this one produced, and a venue
 * with a bad connection cannot rely on the WebSocket to deliver it.
 */
interface StoredEventResult {
  id: string
  eventResult: JsonEventResult
}

/** A dog whose stored result was written by someone else and disagrees with this submission. */
interface EventResultConflict {
  id: string
  /** Present when only one post is in dispute, so the rest of the round need not be re-entered. */
  stationId?: string
  stored: JsonEventResult
  submitted: JsonEventResult
}

interface ProcessedResultSubmissions {
  conflicts: EventResultConflict[]
  /** The trial was handed to the chief judge while the batch was written: the dogs from there on were not. */
  locked: boolean
  patches: Patch<JsonRegistration>[]
  saved: StoredEventResult[]
  unchanged: StoredEventResult[]
}

/**
 * How many dogs one request may carry. A class screenful is a few dozen; the cap is a ceiling on the
 * write fan-out a single request can command, not a limit anyone legitimate meets.
 */
const MAX_RESULT_SUBMISSIONS = 200

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The judge as a client may name one: identity only, so nothing else rides along inside the object. */
const pickJudge = (value: unknown): PublicJudge | undefined => {
  if (!isRecord(value) || typeof value.name !== 'string') return undefined

  const { id, name } = value
  return { name, ...(typeof id === 'number' ? { id } : {}) }
}

/** Everyone the event's configuration knows as a judge, whichever level names them. */
const knownJudges = (confirmedEvent: JsonConfirmedEvent): PublicJudge[] => [
  ...(confirmedEvent.judges ?? []),
  ...(confirmedEvent.stations ?? []).flatMap((station) => station.judges ?? []),
  ...(confirmedEvent.classes ?? []).flatMap((item) => makeArray(item.judge)),
]

/**
 * A client only ever offers judges from the event's own configuration, so a matching id restores the
 * full identity. What matches nothing is reduced to a bare name — a submission cannot smuggle
 * arbitrary content inside a judge object.
 */
const resolveJudge = (value: unknown, judges: PublicJudge[]): PublicJudge | undefined => {
  const picked = pickJudge(value)
  if (!picked) return undefined

  return judges.find((judge) => judge.id !== undefined && judge.id === picked.id) ?? picked
}

const isCount = (value: unknown, least: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= least

/** Where a submitted score goes: its exercise and part, a missing part being the whole exercise. */
const pickAddress = (value: Record<string, unknown>): Pick<SubmittedTask, 'exercise' | 'part'> | undefined => {
  if (!isCount(value.exercise, 1)) return undefined
  if (value.part === undefined || value.part === null) return { exercise: value.exercise, part: 0 }
  return isCount(value.part, 0) ? { exercise: value.exercise, part: value.part } : undefined
}

const pickTask = (value: unknown, judges: PublicJudge[]): SubmittedTask => {
  const address = isRecord(value) ? pickAddress(value) : undefined
  if (!isRecord(value) || !address || (value.points !== null && typeof value.points !== 'number')) {
    throw new LambdaError(422, 'Malformed task')
  }

  const submittedZeroFault = value.zeroFault
  if (submittedZeroFault != null && typeof submittedZeroFault !== 'string') {
    throw new LambdaError(422, 'Malformed task')
  }

  const zeroFault = nowtZeroFaults.find((fault) => fault === submittedZeroFault)
  if (submittedZeroFault != null && !zeroFault) {
    throw new LambdaError(422, `Unknown zero fault '${submittedZeroFault}'`)
  }

  const judge = resolveJudge(value.judge, judges)

  return {
    ...address,
    points: value.points,
    ...(value.recalled === true ? { recalled: true } : {}),
    ...(zeroFault ? { zeroFault } : {}),
    ...(judge ? { judge } : {}),
  }
}

/**
 * Where a round ended: the exercise where the round is scored by exercise (KOE-1665), a number from 1 or
 * none, and the post for a type judged as a whole at posts.
 */
const pickPlace = (
  value: Record<string, unknown>,
  eventType: string,
  what: string
): { exercise?: number } | { stationId?: string } => {
  if (!scoresAtPosts(eventType)) return typeof value.stationId === 'string' ? { stationId: value.stationId } : {}
  const { exercise } = value
  if (exercise === undefined || exercise === null) return {}
  if (typeof exercise !== 'number' || !Number.isInteger(exercise) || exercise < 1) {
    throw new LambdaError(422, `Malformed ${what} exercise`)
  }
  return { exercise }
}

const pickElimination = (value: unknown, eventType: string): EventResultElimination => {
  if (!isRecord(value)) throw new LambdaError(422, 'Malformed elimination')

  const fault = eliminatingFaults(eventType).find((item) => item === value.fault)
  if (!fault) {
    throw new LambdaError(422, `Eliminating fault '${String(value.fault)}' is not valid for ${eventType}`)
  }

  return {
    fault,
    ...pickPlace(value, eventType, 'elimination'),
  }
}

const RETIREMENT_CAUSES = ['handlerChoice', 'injury', 'illness', 'judgeStopped'] as const

const pickRetirement = (value: unknown, eventType: string): EventResultRetirement => {
  if (!isRecord(value)) throw new LambdaError(422, 'Malformed retirement')

  const cause = RETIREMENT_CAUSES.find((item) => item === value.cause)
  if (!cause) throw new LambdaError(422, `Unknown retirement cause '${String(value.cause)}'`)

  return {
    cause,
    ...(typeof value.couldStillHavePlaced === 'boolean' ? { couldStillHavePlaced: value.couldStillHavePlaced } : {}),
    ...pickPlace(value, eventType, 'retirement'),
  }
}

/**
 * The fields a client may write, picked one by one. Everything else in the payload is dropped here
 * and never stored: this path is shared with the widely shared tokenized station link (KOE-1258), so
 * the stored result must not be writable by whatever a request chooses to put in it.
 */
const pickSubmittedResult = (
  value: unknown,
  confirmedEvent: JsonConfirmedEvent,
  judges: PublicJudge[]
): ResultSubmission['eventResult'] => {
  if (!isRecord(value)) throw new LambdaError(422, 'Malformed result submission')

  const eventType = formatTypeOf(confirmedEvent)
  const resultCode =
    typeof value.resultCode === 'string'
      ? availableResultCodes(eventType).find((code) => code === value.resultCode)
      : undefined
  if (typeof value.resultCode === 'string' && !resultCode) {
    throw new LambdaError(422, `Result code '${value.resultCode}' is not valid for ${eventType}`)
  }
  // A type scored at posts takes its result from the scores alone (§5.4.1, KOE-1678), and no client sends
  // one for it: a code here is a client bug, refused like a code outside the alphabet rather than dropped
  // without a word. `resolveEventResult` does not read one either, since it also answers the entry screen.
  if (resultCode && scoresAtPosts(eventType)) {
    throw new LambdaError(
      422,
      `Result code '${resultCode}' is not taken for ${eventType}: its result is derived from the scores`
    )
  }

  const tasks = Array.isArray(value.tasks) ? value.tasks.map((task) => pickTask(task, judges)) : undefined
  const judge = resolveJudge(value.judge, judges)

  return {
    ...(tasks ? { tasks } : {}),
    ...(resultCode ? { resultCode } : {}),
    ...(typeof value.cert === 'boolean' ? { cert: value.cert } : {}),
    ...(typeof value.resCert === 'boolean' ? { resCert: value.resCert } : {}),
    ...(value.elimination != null ? { elimination: pickElimination(value.elimination, eventType) } : {}),
    ...(value.retirement != null ? { retirement: pickRetirement(value.retirement, eventType) } : {}),
    ...(judge ? { judge } : {}),
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
  }
}

export const parseSubmissions = (body: string | null, confirmedEvent: JsonConfirmedEvent): ResultSubmission[] => {
  const parsed = parseJSONWithFallback(body, [])
  if (!Array.isArray(parsed)) return []
  if (parsed.length > MAX_RESULT_SUBMISSIONS) {
    throw new LambdaError(422, `Too many submissions (max ${MAX_RESULT_SUBMISSIONS})`)
  }

  const judges = knownJudges(confirmedEvent)
  const submissions: ResultSubmission[] = []

  for (const value of parsed) {
    if (!isRecord(value) || typeof value.id !== 'string') continue

    submissions.push({
      eventResult: pickSubmittedResult(value.eventResult, confirmedEvent, judges),
      id: value.id,
      ...(typeof value.stationId === 'string' ? { stationId: value.stationId } : {}),
      ...(typeof value.basedOn === 'string' ? { basedOn: value.basedOn } : {}),
    })
  }

  return submissions
}

type RoundOutcomes = Pick<SubmittedEventResult, 'elimination' | 'retirement'>

/**
 * The outcome a post's save leaves on a round scored at posts (KOE-1615). A post sets, changes or clears
 * an outcome at its own exercises. Where the stored one or the submitted one is held elsewhere
 * (`outcomeHeldElsewhere`) the stored pair stands, or none: the save's scores still go in, and a page
 * echoing an outcome the secretary has since cleared saves without it.
 */
const postOutcomes = (
  submitted: RoundOutcomes,
  stored: RoundOutcomes | undefined,
  exercises: readonly number[]
): RoundOutcomes =>
  outcomeHeldElsewhere(stored, exercises) || outcomeHeldElsewhere(submitted, exercises) ? (stored ?? {}) : submitted

/** Where a qualitative type's post is the whole trial, its outcome is at that post, whatever the body claims. */
const atPost = (outcomes: RoundOutcomes, stationId: string): RoundOutcomes => ({
  ...(outcomes.elimination ? { elimination: { ...outcomes.elimination, stationId } } : {}),
  ...(outcomes.retirement ? { retirement: { ...outcomes.retirement, stationId } } : {}),
})

/**
 * What a tokenized station link may write: its post's scores and the outcome that ended the round, where
 * it is the post's own (`postOutcomes`). The event secretary's endpoint shares the classification but not
 * this rule, and may change any outcome. The whole-round fields, cert and notes, are the secretary's, and
 * are dropped here the same way the merge drops tasks of the exercises done at other posts. Except where
 * there is no round to score: a qualitative type's post *is* the whole trial, and its recording is the
 * judge's decision and who made it, so those two go through. Scoped against each reading of the dog the
 * classification makes, since what the outcome may be depends on the one stored (KOE-1490).
 */
export const stationScopedSubmission = (
  submission: ResultSubmission,
  stationId: string,
  confirmedEvent: JsonConfirmedEvent,
  registration: JsonRegistration
): ResultSubmission => {
  const { tasks, resultCode, judge } = submission.eventResult
  const qualitative = !scoresAtPosts(formatTypeOf(confirmedEvent))
  const exercises = qualitative ? [] : stationExercises(confirmedEvent, registration, stationId)
  const { elimination, retirement } = qualitative
    ? atPost(submission.eventResult, stationId)
    : postOutcomes(submission.eventResult, registration.eventResult, exercises)

  return {
    eventResult: {
      ...(tasks ? { tasks } : {}),
      ...(elimination ? { elimination } : {}),
      ...(retirement ? { retirement } : {}),
      ...(qualitative && resultCode ? { resultCode } : {}),
      ...(qualitative && judge ? { judge } : {}),
    },
    id: submission.id,
    stationId,
    ...(submission.basedOn ? { basedOn: submission.basedOn } : {}),
  }
}

/**
 * Recompute rather than trust. The client sends task scores and the judge's own calls; the totals, the
 * percentage and the composed result are derived here from the event's own course, so a client cannot
 * report a prize its scores do not support.
 */
const resolveFor = (
  confirmedEvent: JsonConfirmedEvent,
  registration: Pick<JsonRegistration, 'class' | 'eventType' | 'group' | 'startGroup'>,
  submitted: SubmittedEventResult,
  updatedAt: string,
  updatedBy: string
): JsonEventResult => {
  const eventClass = registration.class ?? undefined

  return {
    ...resolveEventResult(submitted, {
      eventClass,
      eventType: formatTypeOf(confirmedEvent),
      round: dogRound(confirmedEvent, rotationDogOf(registration)),
    }),
    updatedAt,
    updatedBy,
  }
}

/**
 * What a submission turns out to be, decided before anything is written. Keeping the decision apart
 * from the writing is what lets the loop below read as three outcomes rather than as one long branch.
 */
type SubmissionOutcome =
  | { kind: 'unchanged'; eventResult: JsonEventResult }
  | { kind: 'conflict'; stored: JsonEventResult; submitted: JsonEventResult }
  | { kind: 'save'; eventResult: JsonEventResult; hadStored: boolean }

const classifySubmission = (
  confirmedEvent: JsonConfirmedEvent,
  registration: JsonRegistration,
  submission: ResultSubmission,
  timestamp: string,
  userName: string
): SubmissionOutcome => {
  const stored = registration.eventResult
  // A post's slice of a scored round is its tasks, the exercises the dog's group does there. Where
  // nothing is scored the post is the whole trial, and its submission is the whole result, compared,
  // versioned and merged as one.
  const stationId = scoresAtPosts(formatTypeOf(confirmedEvent)) ? submission.stationId : undefined
  const exercises = stationId ? stationExercises(confirmedEvent, registration, stationId) : []
  const renewed = outcomeExercises(
    stored,
    submission.eventResult,
    exercisePostsOf(dogRound(confirmedEvent, rotationDogOf(registration)))
  )
  const stamped = (tasks: readonly SubmittedTask[]) =>
    stampTasks(tasks, stored?.tasks, renewed, { updatedAt: timestamp, updatedBy: userName })
  // A post's save stays as it was sent, where a stored blank marks its place in the queue as done. On a whole
  // round a blank with nothing stored is nothing: stored, its stamp would give the post a version nobody wrote.
  const sentTasks = stationId
    ? submission.eventResult.tasks
    : submission.eventResult.tasks?.filter(
        (task) => isRecordedTask(task) || stored?.tasks?.some((entry) => holdsScore(entry, task))
      )
  const submittedTasks = sentTasks && stamped(sentTasks)
  const submitted: SubmittedEventResult = { ...submission.eventResult, tasks: submittedTasks }
  const resolve = (result: SubmittedEventResult) =>
    resolveFor(confirmedEvent, registration, result, timestamp, userName)

  // A retry from the field is the common case, not an edge case: the venue's connection drops, the
  // secretary saves again, and the first attempt turns out to have landed. Comparing content rather
  // than version makes that read as already stored, not as someone else's competing edit.
  const alreadyStored = stationId
    ? sameStationTasks(stored?.tasks, submittedTasks, exercises) && !outcomeDiffers(stored, submitted)
    : sameEventResult(stored, resolve(submitted))

  if (alreadyStored) return { eventResult: stored ?? resolve(submitted), kind: 'unchanged' }

  // Only a genuinely different result written by someone else is a conflict. Scoped to the post when
  // the submission is: two stations scoring the same dog touch different tasks and must not collide.
  const storedVersion = editVersion(stored, stationId ? exercises : undefined)

  if (stored && storedVersion && storedVersion !== submission.basedOn) {
    return { kind: 'conflict', stored, submitted: resolve(submitted) }
  }

  // Merge rather than replace, or a station secretary's save carries away the scores another post
  // already recorded for the same dog. Stamped again after the merge: the secretary's view of one post may
  // change the outcome of another, and that post's stored tasks are what moves its version.
  const tasks = stationId ? stamped(mergeStationTasks(stored?.tasks, submittedTasks, exercises)) : submittedTasks

  return { eventResult: resolve({ ...submitted, tasks }), hadStored: Boolean(stored), kind: 'save' }
}

/** What a post's save or the event save is told when the layout it was made against has changed. */
const LAYOUT_CHANGED_MESSAGE = 'The results changed while the stations were saved; save again'

/** A task's address as an error names it. */
const taskName = (task: SubmittedTask): string => `exercise ${task.exercise}#${task.part}`

/**
 * Refuse a score the round cannot hold. The totals are recomputed rather than trusted, but a
 * recomputation happily sums an out-of-range figure — 30 points on a 20-point task would derive an
 * unearned prize as faithfully as a real score — and a task naming a slot outside the round would
 * ride along stored forever. A post's submission may hold only the exercises the dog's group does at the
 * post: a page opened before the running order changed would otherwise send an exercise the merge leaves
 * out and report it saved, so it is told the layout changed (409), and its page says so, reads the list
 * again and lets go of the dog (KOE-1694).
 */
const validateSubmittedTasks = (
  round: readonly ExerciseSlot[],
  submission: ResultSubmission,
  exercises: readonly number[] | undefined
): void => {
  const tasks = submission.eventResult.tasks
  if (!tasks?.length) return

  for (const task of tasks) {
    const slot = round.find((item) => holdsScore(item, task))
    if (!slot) {
      throw new LambdaError(422, `Task ${taskName(task)} is not part of the round`)
    }
    if (exercises && !exercises.includes(task.exercise)) {
      throw httpError(409, { error: 'staleData', message: LAYOUT_CHANGED_MESSAGE })
    }

    const ceiling = taskEntryCeiling({ maxPoints: slot.maxPoints, ...(task.recalled ? { recalled: true } : {}) })
    if (task.points !== null && (task.points < 0 || task.points > ceiling)) {
      throw new LambdaError(422, `Task points ${task.points} out of range for ${taskName(task)}`)
    }
  }
}

/**
 * The results of a trial handed to the chief judge (or finished) are not the secretary's to change
 * (KOE-1140). Read as last written, because the lock is taken by another request, and asked only of a
 * submission that would change something: a retry of a save that already landed is still answered.
 */
const isEventLocked = async (eventId: string): Promise<boolean> => isResultsLocked(await getEvent(eventId, true))

/** A submission checked and classified against one reading of its dog, ready to be written or reported. */
interface PlannedSubmission {
  outcome: SubmissionOutcome
  /** The dog as read, which a save is written over. */
  registration: JsonRegistration
  /** The submission as classified: scoped to the post against this reading, where it came from one. */
  submission: ResultSubmission
}

/** What every classification of one batch shares. */
interface SubmissionContext {
  confirmedEvent: JsonConfirmedEvent
  /** The post of a tokenized station link, which scopes every submission of the batch to it. */
  stationId?: string
  timestamp: string
  userName: string
}

/**
 * Everything a submission may be refused for before anything is written, and what it turns out to be
 * against this reading of its dog. A post's submission is scoped against the same reading: the outcome it
 * may write depends on the one stored (`stationScopedSubmission`).
 */
const planSubmission = (
  { confirmedEvent, stationId, timestamp, userName }: SubmissionContext,
  registration: JsonRegistration | undefined,
  received: ResultSubmission
): PlannedSubmission => {
  if (!registration) throw new LambdaError(404, `Registration '${received.id}' not found`)
  const submission = stationId ? stationScopedSubmission(received, stationId, confirmedEvent, registration) : received

  // A reserve never called up and a cancelled entry have no round to record. The views do not offer
  // them a row, so this is a client working from a list that has moved on since it loaded — refusing
  // is what stops a result being attributed to a dog that was not there.
  if (!isScorableRegistration(registration)) {
    throw new LambdaError(422, `Registration '${submission.id}' did not run`)
  }

  if (scoresAtPosts(formatTypeOf(confirmedEvent))) {
    const { stationId } = submission
    validateSubmittedTasks(
      dogRound(confirmedEvent, rotationDogOf(registration)),
      submission,
      stationId ? stationExercises(confirmedEvent, registration, stationId) : undefined
    )
  }

  // The alphabet is the event type's own: a pass/fail test awards 1 or 0 and nothing else, so a code
  // outside it is a client bug to refuse, not a judgement to store.
  const { resultCode } = submission.eventResult
  const formatType = formatTypeOf(confirmedEvent)
  if (resultCode && !availableResultCodes(formatType).includes(resultCode)) {
    throw new LambdaError(422, `Result code '${resultCode}' is not valid for ${formatType}`)
  }

  return {
    outcome: classifySubmission(confirmedEvent, registration, submission, timestamp, userName),
    registration,
    submission,
  }
}

/**
 * Writes a dog's save over the result it was classified against (KOE-1490). Another request may have
 * written the dog since the batch read it: then the row is read again as last written and the same
 * submission planned afresh against it, so another post's scores merge in, the same content is
 * unchanged, and a different result is an ordinary conflict. A save still losing after the attempts is
 * a conflict too, and the other dogs of the batch go on. Answers the plan that stands.
 */
const settleSubmission = async (
  eventId: string,
  context: SubmissionContext,
  received: ResultSubmission,
  planned: PlannedSubmission
): Promise<PlannedSubmission> => {
  // The save as it last lost, a conflict with the result it was written over. Every attempt after the first
  // works from a row read after a result was stored, so the last attempt always has one.
  let lost: PlannedSubmission | undefined
  try {
    return await retryOnConditionFailure({
      exhausted: (error) => error,
      initial: planned,
      maxAttempts: RESULTS_WRITE_ATTEMPTS,
      reread: async () => planSubmission(context, await readRegistration(eventId, received.id, true), received),
      work: async (current: PlannedSubmission) => {
        const { outcome, registration } = current
        if (outcome.kind === 'save') {
          const stored = registration.eventResult
          lost = stored && { ...current, outcome: { kind: 'conflict', stored, submitted: outcome.eventResult } }
          await writeEventResult(eventId, registration.id, outcome.eventResult, stored?.updatedAt)
        }
        return current
      },
    })
  } catch (error) {
    if (!isConditionalCheckFailure(error) || !lost) throw error
    return lost
  }
}

/**
 * Classify, write and audit a batch of result submissions. Shared by the event secretary's endpoint
 * and the tokenized station endpoint, so the two cannot drift on what counts as a retry, a conflict
 * or a save. `userName` is whoever this write is attributed to, and `stationId` the post a station
 * link scopes every submission to.
 */
export const processResultSubmissions = async (
  eventId: string,
  confirmedEvent: JsonConfirmedEvent,
  registrations: readonly JsonRegistration[],
  submissions: readonly ResultSubmission[],
  userName: string,
  stationId?: string
): Promise<ProcessedResultSubmissions> => {
  // One timestamp for the batch, so every task the batch changes shares a version.
  const context: SubmissionContext = { confirmedEvent, stationId, timestamp: new Date().toISOString(), userName }

  const patches: Patch<JsonRegistration>[] = []
  const saved: StoredEventResult[] = []
  const unchanged: StoredEventResult[] = []
  const conflicts: EventResultConflict[] = []
  let locked = false

  // Decide first, write second: a submission that is refused outright refuses the batch before a dog is written.
  const planned = submissions.map((received) => ({
    first: planSubmission(
      context,
      registrations.find((item) => item.id === received.id),
      received
    ),
    received,
  }))

  // One dog at a time, the lock asked of the row as last written before each: a hand-over that takes the
  // lock while a batch is being written stops the dogs not yet written, and the ones that were stay.
  // A retry of a save that already landed is answered without asking the lock, and writes nothing.
  await mapWithConcurrency(planned, 1, async ({ first, received }) => {
    if (first.outcome.kind !== 'unchanged') {
      locked ||= await isEventLocked(eventId)
      if (locked) return
    }

    const { outcome, registration, submission } = await settleSubmission(eventId, context, received, first)
    if (outcome.kind === 'unchanged') {
      unchanged.push({ eventResult: outcome.eventResult, id: submission.id })
      return
    }
    if (outcome.kind === 'conflict') {
      conflicts.push({
        id: submission.id,
        ...(submission.stationId ? { stationId: submission.stationId } : {}),
        stored: outcome.stored,
        submitted: outcome.submitted,
      })
      return
    }

    const { eventResult } = outcome
    await audit({
      auditKey: registrationAuditKey({ eventId, id: submission.id }),
      ...resultSavedAudit(
        outcome.hadStored,
        auditResultText(eventResult, formatTypeOf(confirmedEvent), registration.class ?? undefined)
      ),
      user: userName,
    })

    patches.push({ eventResult, id: submission.id })
    saved.push({ eventResult, id: submission.id })
  })

  return { conflicts, locked, patches, saved, unchanged }
}

/**
 * A dog whose stored result a change of the event's posts, rotation or classes changes (KOE-1666): the
 * result as recomputed, and the recorded scores the change drops. An empty field the change leaves out is
 * gone from the result too, but is no score to ask about (`isRecordedTask`).
 */
interface RecomputedResult {
  registration: JsonRegistration & { eventResult: JsonEventResult }
  eventResult: JsonEventResult
  dropped: JsonEventResultTask[]
  /** The exercises the dropped scores are of, which the secretary is told: a split exercise counts once. */
  droppedExercises: number
}

/** The stored result as the submission it was saved from, with only the scores the new round keeps. */
const storedAsSubmitted = (stored: JsonEventResult, tasks: JsonEventResultTask[]): SubmittedEventResult => {
  const {
    maxPoints: _maxPoints,
    percentage: _percentage,
    points: _points,
    result: _result,
    tasks: _tasks,
    updatedAt: _at,
    updatedBy: _by,
    ...rest
  } = stored
  return { ...rest, tasks }
}

interface RecomputeContext {
  before: JsonConfirmedEvent
  after: JsonConfirmedEvent
  timestamp: string
  userName: string
}

/**
 * One dog's result against the event as it is about to be saved, by the rule its save uses (`resolveFor`).
 * Only a dog whose round scores differently is looked at (another number of exercises, or an exercise
 * split another way), and only a result that comes out different is returned: the recompute is attributed
 * to whoever saved the change, and moves the version only where there is something new to see.
 */
const recomputeFor = (registration: JsonRegistration, context: RecomputeContext): RecomputedResult | undefined => {
  const stored = registration.eventResult
  if (!stored || !isScorableRegistration(registration)) return undefined

  const dog = rotationDogOf(registration)
  const before: ExerciseSlot[] = dogRound(context.before, dog)
  const after: ExerciseSlot[] = dogRound(context.after, dog)
  if (!roundsDiffer(before, after)) return undefined

  const { dropped, kept } = reconcileRoundTasks(before, after, stored.tasks)
  const eventResult = resolveFor(
    context.after,
    registration,
    storedAsSubmitted(stored, kept),
    context.timestamp,
    context.userName
  )
  if (sameEventResult(stored, eventResult)) return undefined

  const recorded = dropped.filter(isRecordedTask)
  return {
    dropped: recorded,
    // What the secretary is told of is exercises: the parts of one exercise count once.
    droppedExercises: new Set(recorded.map((task) => task.exercise)).size,
    eventResult,
    registration: { ...registration, eventResult: stored },
  }
}

const planRecompute = (registrations: readonly JsonRegistration[], context: RecomputeContext): RecomputedResult[] =>
  registrations.flatMap((registration) => recomputeFor(registration, context) ?? [])

/** Each dropped score, named by its dog, its exercise and the version it was recorded in. */
const dropKeys = (plan: readonly RecomputedResult[]): string[] =>
  plan
    .flatMap(({ dropped, registration }) =>
      dropped.map((task) => `${registration.id}|${task.exercise}#${task.part}|${task.updatedAt}`)
    )
    .sort((a, b) => a.localeCompare(b, 'en'))

/**
 * The confirmation of one set of drops. A score recorded or changed after the secretary was asked gives
 * another set, and so another confirmation: what they confirmed is never stretched over it.
 */
const dropConfirmation = (keys: readonly string[]): string => createHash('sha256').update(keys.join('\n')).digest('hex')

const droppedTasksBody = (plan: readonly RecomputedResult[]): ResultTasksDroppedBody => ({
  confirmation: dropConfirmation(dropKeys(plan)),
  dogs: plan
    .filter(({ dropped }) => dropped.length > 0)
    .map(({ droppedExercises, registration }) => {
      const number = getRegistrationPlacement(registration)?.number
      return {
        id: registration.id,
        name: registration.dog.name ?? '',
        tasks: droppedExercises,
        ...(registration.class ? { class: registration.class } : {}),
        ...(number === undefined ? {} : { number }),
      }
    }),
  error: 'resultTasksDropped',
})

/**
 * What a patch must say for the open pages to arrive at the stored result: a key the recompute left out
 * (a prize the round no longer supports, the totals of a round now incomplete) goes as `null`, which is
 * how a patch deletes, or the pages would go on showing it.
 */
const eventResultPatch = (stored: JsonEventResult, eventResult: JsonEventResult): Patch<JsonEventResult> => {
  const removed = Object.keys(stored).filter((key) => !Object.hasOwn(eventResult, key))
  return { ...eventResult, ...Object.fromEntries(removed.map((key) => [key, null])) }
}

/**
 * Writes one dog's recomputed result over the result it was recomputed from. A dog a post saved in the
 * meantime stops the save before the event is stored: saving again recomputes the dogs still different,
 * against what is stored then, and asks again about any score that would go.
 */
const writeRecomputed = async (
  eventId: string,
  { droppedExercises, eventResult, registration }: RecomputedResult,
  context: RecomputeContext
): Promise<Patch<JsonRegistration>> => {
  if (await isEventLocked(eventId)) throw httpError(423, { error: 'resultsLocked' })

  const { id } = registration
  try {
    await writeEventResult(eventId, id, eventResult, registration.eventResult.updatedAt)
  } catch (error) {
    if (isConditionalCheckFailure(error)) throw httpError(409, { error: 'staleData', message: LAYOUT_CHANGED_MESSAGE })
    throw error
  }

  await audit({
    auditKey: registrationAuditKey({ eventId, id }),
    ...resultRecomputedAudit(
      auditResultText(eventResult, formatTypeOf(context.after), registration.class ?? undefined),
      droppedExercises
    ),
    user: context.userName,
  })
  return { eventResult: eventResultPatch(registration.eventResult, eventResult), id }
}

interface ResultRecomputeRequest {
  /** The event as stored, its days read as keys. */
  existing: JsonConfirmedEvent | undefined
  /** The event as it is about to be saved. */
  data: JsonConfirmedEvent
  /** What the secretary confirmed of the drops they were shown, from `?confirmDrops`. */
  confirmDrops: string | undefined
  timestamp: string
  userName: string
}

/**
 * Brings the stored results in step with a change of the event's posts, rotation or classes (KOE-1666),
 * before the event itself is saved: the dogs are written first, so a save that stops halfway leaves the
 * change unsaved and saving it again recomputes what is left. A trial whose results are handed over is
 * not changed (423), and a change that drops recorded scores is made only once the secretary has
 * confirmed that very set of drops (409 `resultTasksDropped` until then). Answers the patches for the
 * open pages, to be sent once the event is saved.
 */
export const recomputeEventResults = async ({
  confirmDrops,
  data,
  existing,
  timestamp,
  userName,
}: ResultRecomputeRequest): Promise<Patch<JsonRegistration>[]> => {
  if (!existing || !scoresAtPosts(formatTypeOf(data))) return []
  if (!objectsDiffer(roundInputsOf(existing), roundInputsOf(data))) return []

  const context: RecomputeContext = { after: data, before: existing, timestamp, userName }
  const plan = planRecompute(await readEventRegistrations(data.id, true), context)
  if (plan.length === 0) return []

  if (await isEventLocked(data.id)) throw httpError(423, { error: 'resultsLocked' })

  const keys = dropKeys(plan)
  if (keys.length && confirmDrops !== dropConfirmation(keys)) throw httpError(409, droppedTasksBody(plan))

  return mapWithConcurrency(plan, 1, (entry) => writeRecomputed(data.id, entry, context))
}
