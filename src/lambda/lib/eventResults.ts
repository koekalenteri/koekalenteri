import type { SubmittedEventResult, SubmittedTask } from '../../lib/results'
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
import { objectsDiffer } from '../../lib/diff'
import { isScorableRegistration } from '../../lib/registration'
import {
  availableResultCodes,
  classRound,
  eliminatingFaults,
  mergeStationTasks,
  nowtZeroFaults,
  resolveEventResult,
  sameEventResult,
  sameStationTasks,
  scoresAtPosts,
  stationVersion,
  taskEntryCeiling,
} from '../../lib/results'
import { audit, registrationAuditKey } from './audit'
import { parseJSONWithFallback } from './json'
import { LambdaError } from './lambda'
import { updateRegistrationField } from './registration'

/** The outcome dropdown's Finnish labels, for the audit line (KOE-1284). */
const ELIMINATING_FAULT_TEXT: Record<EventResultElimination['fault'], string> = {
  aggression: 'aggressiivinen käyttäytyminen',
  gunShyness: 'laukausarkuus',
  hardMouth: 'kovasuisuus',
  harshHandling: 'koiran kurittaminen koepaikalla',
  marking: 'merkkaaminen',
  refusedRetrieve: 'kieltäytyminen noudosta',
}

const RETIREMENT_CAUSE_TEXT: Record<EventResultRetirement['cause'], string> = {
  handlerChoice: 'ohjaaja keskeytti',
  injury: 'koira loukkaantui',
  judgeStopped: 'tuomari keskeytti kokeen',
}

/**
 * What the audit line says was saved: the result, the points, and the outcome extra info — the
 * secretary must be able to read back from the trail what they entered (KOE-1284). Audit messages
 * are stored as Finnish text, like every message this module's callers write.
 */
const auditResultText = (eventResult: JsonEventResult): string => {
  const parts: string[] = []
  if (eventResult.result) parts.push(eventResult.result)
  if (typeof eventResult.points === 'number') {
    parts.push(eventResult.maxPoints ? `${eventResult.points}/${eventResult.maxPoints} p` : `${eventResult.points} p`)
  }
  if (eventResult.elimination) {
    parts.push(`hylkäävä virhe: ${ELIMINATING_FAULT_TEXT[eventResult.elimination.fault]}`)
  }
  if (eventResult.retirement) parts.push(RETIREMENT_CAUSE_TEXT[eventResult.retirement.cause])
  if (eventResult.notes) parts.push(eventResult.notes)
  return parts.length ? `: ${parts.join(', ')}` : ''
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
  patches: Patch<JsonRegistration>[]
  saved: StoredEventResult[]
  unchanged: StoredEventResult[]
}

/**
 * Who recorded a task and when. Stamped here rather than taken from the client: it decides what counts
 * as a competing edit, so it must come from the server that accepted the write.
 */
const stampProvenance = (
  tasks: SubmittedTask[] | undefined,
  updatedAt: string,
  updatedBy: string
): JsonEventResultTask[] | undefined => tasks?.map((task) => ({ ...task, updatedAt, updatedBy }))

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
  ...(confirmedEvent.classes ?? []).flatMap((item) =>
    Array.isArray(item.judge) ? item.judge : item.judge ? [item.judge] : []
  ),
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

const pickTask = (value: unknown, judges: PublicJudge[]): SubmittedTask => {
  if (
    !isRecord(value) ||
    typeof value.stationId !== 'string' ||
    typeof value.index !== 'number' ||
    !Number.isInteger(value.index) ||
    (value.points !== null && typeof value.points !== 'number')
  ) {
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
    index: value.index,
    points: value.points,
    stationId: value.stationId,
    ...(value.recalled === true ? { recalled: true } : {}),
    ...(value.retired === true ? { retired: true } : {}),
    ...(zeroFault ? { zeroFault } : {}),
    ...(judge ? { judge } : {}),
  }
}

const pickElimination = (value: unknown, eventType: string): EventResultElimination => {
  if (!isRecord(value)) throw new LambdaError(422, 'Malformed elimination')

  const fault = eliminatingFaults(eventType).find((item) => item === value.fault)
  if (!fault) {
    throw new LambdaError(422, `Eliminating fault '${String(value.fault)}' is not valid for ${eventType}`)
  }

  return { fault, ...(typeof value.stationId === 'string' ? { stationId: value.stationId } : {}) }
}

const RETIREMENT_CAUSES = ['handlerChoice', 'injury', 'judgeStopped'] as const

const pickRetirement = (value: unknown): EventResultRetirement => {
  if (!isRecord(value)) throw new LambdaError(422, 'Malformed retirement')

  const cause = RETIREMENT_CAUSES.find((item) => item === value.cause)
  if (!cause) throw new LambdaError(422, `Unknown retirement cause '${String(value.cause)}'`)

  return {
    cause,
    ...(typeof value.couldStillHavePlaced === 'boolean' ? { couldStillHavePlaced: value.couldStillHavePlaced } : {}),
    ...(typeof value.stationId === 'string' ? { stationId: value.stationId } : {}),
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

  const { eventType } = confirmedEvent
  const resultCode =
    typeof value.resultCode === 'string'
      ? availableResultCodes(eventType).find((code) => code === value.resultCode)
      : undefined
  if (typeof value.resultCode === 'string' && !resultCode) {
    throw new LambdaError(422, `Result code '${value.resultCode}' is not valid for ${eventType}`)
  }

  const tasks = Array.isArray(value.tasks) ? value.tasks.map((task) => pickTask(task, judges)) : undefined
  const judge = resolveJudge(value.judge, judges)

  return {
    ...(tasks ? { tasks } : {}),
    ...(resultCode ? { resultCode } : {}),
    ...(typeof value.cert === 'boolean' ? { cert: value.cert } : {}),
    ...(typeof value.resCert === 'boolean' ? { resCert: value.resCert } : {}),
    ...(value.elimination != null ? { elimination: pickElimination(value.elimination, eventType) } : {}),
    ...(value.retirement != null ? { retirement: pickRetirement(value.retirement) } : {}),
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

/**
 * What a tokenized station link may write: its post's scores and the round-ending outcome. The
 * whole-round fields — cert, notes, the judging judge, an overriding result code — are the event
 * secretary's, and are dropped here the same way the merge drops tasks naming another post.
 */
export const stationScopedSubmission = (submission: ResultSubmission, stationId: string): ResultSubmission => {
  const { elimination, retirement, tasks } = submission.eventResult

  return {
    eventResult: {
      ...(tasks ? { tasks } : {}),
      ...(elimination ? { elimination } : {}),
      ...(retirement ? { retirement } : {}),
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
  registration: JsonRegistration,
  submitted: SubmittedEventResult,
  updatedAt: string,
  updatedBy: string
): JsonEventResult => {
  const eventClass = registration.class ?? undefined
  const classStations = confirmedEvent.classes?.find((item) => item.class === eventClass)?.stations

  return {
    ...resolveEventResult(submitted, {
      classStations,
      eventClass,
      eventType: confirmedEvent.eventType,
      stations: confirmedEvent.stations,
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

/**
 * Whether a submission changes the round-ending outcome. Task equality alone must not read as a retry:
 * an elimination recorded before the post scored anything arrives with the task list unchanged.
 */
const outcomeDiffers = (stored: JsonEventResult | undefined, submitted: SubmittedEventResult): boolean =>
  objectsDiffer(
    { elimination: stored?.elimination, retirement: stored?.retirement },
    { elimination: submitted.elimination, retirement: submitted.retirement }
  )

const classifySubmission = (
  confirmedEvent: JsonConfirmedEvent,
  registration: JsonRegistration,
  submission: ResultSubmission,
  timestamp: string,
  userName: string
): SubmissionOutcome => {
  const stored = registration.eventResult
  const { stationId } = submission
  const submittedTasks = stampProvenance(submission.eventResult.tasks, timestamp, userName)
  const submitted: SubmittedEventResult = { ...submission.eventResult, tasks: submittedTasks }
  const resolve = (result: SubmittedEventResult) =>
    resolveFor(confirmedEvent, registration, result, timestamp, userName)

  // A retry from the field is the common case, not an edge case: the venue's connection drops, the
  // secretary saves again, and the first attempt turns out to have landed. Comparing content rather
  // than version makes that read as already stored, not as someone else's competing edit.
  const alreadyStored = stationId
    ? sameStationTasks(stored?.tasks, submittedTasks, stationId) && !outcomeDiffers(stored, submitted)
    : sameEventResult(stored, resolve(submitted))

  if (alreadyStored) return { eventResult: stored ?? resolve(submitted), kind: 'unchanged' }

  // Only a genuinely different result written by someone else is a conflict. Scoped to the post when
  // the submission is: two stations scoring the same dog touch different tasks and must not collide.
  const storedVersion = stationId ? stationVersion(stored?.tasks, stationId) : stored?.updatedAt

  if (storedVersion && storedVersion !== submission.basedOn) {
    return { kind: 'conflict', stored: stored as JsonEventResult, submitted: resolve(submitted) }
  }

  // Merge rather than replace, or a station secretary's save carries away the scores another post
  // already recorded for the same dog.
  const tasks = stationId ? mergeStationTasks(stored?.tasks, submittedTasks, stationId) : submittedTasks

  return { eventResult: resolve({ ...submitted, tasks }), hadStored: Boolean(stored), kind: 'save' }
}

/**
 * Classify, write and audit a batch of result submissions. Shared by the event secretary's endpoint
 * and the tokenized station endpoint, so the two cannot drift on what counts as a retry, a conflict
 * or a save — `userName` is whoever this write is attributed to.
 */
/**
 * Refuse a score the round cannot hold. The totals are recomputed rather than trusted, but a
 * recomputation happily sums an out-of-range figure — 30 points on a 20-point task would derive an
 * unearned prize as faithfully as a real score — and a task naming a slot outside the round would
 * ride along stored forever.
 */
const validateSubmittedTasks = (
  confirmedEvent: JsonConfirmedEvent,
  registration: JsonRegistration,
  submission: ResultSubmission
): void => {
  const tasks = submission.eventResult.tasks
  if (!tasks?.length) return

  const eventClass = registration.class ?? undefined
  const classStations = confirmedEvent.classes?.find((item) => item.class === eventClass)?.stations
  const round = classRound(confirmedEvent.stations ?? [], classStations)

  for (const task of tasks) {
    const slot = round.find((item) => item.stationId === task.stationId && item.index === task.index)
    if (!slot) {
      throw new LambdaError(422, `Task ${task.stationId}#${task.index} is not part of the round`)
    }

    const ceiling = taskEntryCeiling({ maxPoints: slot.maxPoints, ...(task.recalled ? { recalled: true } : {}) })
    if (task.points !== null && (task.points < 0 || task.points > ceiling)) {
      throw new LambdaError(422, `Task points ${task.points} out of range for ${task.stationId}#${task.index}`)
    }
  }
}

export const processResultSubmissions = async (
  eventId: string,
  confirmedEvent: JsonConfirmedEvent,
  registrations: JsonRegistration[],
  submissions: ResultSubmission[],
  userName: string
): Promise<ProcessedResultSubmissions> => {
  // One timestamp for the batch, so every task saved together shares a version.
  const timestamp = new Date().toISOString()

  const patches: Patch<JsonRegistration>[] = []
  const saved: StoredEventResult[] = []
  const unchanged: StoredEventResult[] = []
  const conflicts: EventResultConflict[] = []

  for (const submission of submissions) {
    const registration = registrations.find((item) => item.id === submission.id)
    if (!registration) throw new LambdaError(404, `Registration '${submission.id}' not found`)

    // A reserve never called up and a cancelled entry have no round to record. The views do not offer
    // them a row, so this is a client working from a list that has moved on since it loaded — refusing
    // is what stops a result being attributed to a dog that was not there.
    if (!isScorableRegistration(registration)) {
      throw new LambdaError(422, `Registration '${submission.id}' did not run`)
    }

    if (scoresAtPosts(confirmedEvent.eventType)) {
      validateSubmittedTasks(confirmedEvent, registration, submission)
    }

    // The alphabet is the event type's own: a pass/fail test awards 1 or 0 and nothing else, so a code
    // outside it is a client bug to refuse, not a judgement to store.
    const { resultCode } = submission.eventResult
    if (resultCode && !availableResultCodes(confirmedEvent.eventType).includes(resultCode)) {
      throw new LambdaError(422, `Result code '${resultCode}' is not valid for ${confirmedEvent.eventType}`)
    }

    const outcome = classifySubmission(confirmedEvent, registration, submission, timestamp, userName)

    if (outcome.kind === 'unchanged') {
      unchanged.push({ eventResult: outcome.eventResult, id: submission.id })
      continue
    }

    if (outcome.kind === 'conflict') {
      conflicts.push({
        id: submission.id,
        ...(submission.stationId ? { stationId: submission.stationId } : {}),
        stored: outcome.stored,
        submitted: outcome.submitted,
      })
      continue
    }

    const { eventResult } = outcome

    await updateRegistrationField(eventId, submission.id, 'eventResult', eventResult)
    await audit({
      auditKey: registrationAuditKey({ eventId, id: submission.id }),
      message: `${outcome.hadStored ? 'Muutti tulosta' : 'Tallensi tuloksen'}${auditResultText(eventResult)}`,
      user: userName,
    })

    patches.push({ eventResult, id: submission.id })
    saved.push({ eventResult, id: submission.id })
  }

  return { conflicts, patches, saved, unchanged }
}
