import type { SubmittedEventResult, SubmittedTask } from '../../lib/results'
import type { JsonConfirmedEvent, JsonEventResult, JsonEventResultTask, JsonRegistration, Patch } from '../../types'
import {
  mergeStationTasks,
  resolveEventResult,
  sameEventResult,
  sameStationTasks,
  stationVersion,
} from '../../lib/results'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId, updateRegistrationField } from '../lib/registration'
import { publishRegistrationPatches } from '../lib/ws/actions'

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

/**
 * Who recorded a task and when. Stamped here rather than taken from the client: it decides what counts
 * as a competing edit, so it must come from the server that accepted the write.
 */
const stampProvenance = (
  tasks: SubmittedTask[] | undefined,
  updatedAt: string,
  updatedBy: string
): JsonEventResultTask[] | undefined => tasks?.map((task) => ({ ...task, updatedAt, updatedBy }))

const isSubmission = (value: unknown): value is ResultSubmission =>
  typeof value === 'object' && value !== null && typeof (value as ResultSubmission).id === 'string'

const parseSubmissions = (body: string | null): ResultSubmission[] => {
  const parsed = parseJSONWithFallback(body, [])
  if (!Array.isArray(parsed)) return []

  return parsed.filter(isSubmission)
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
    ? sameStationTasks(stored?.tasks, submittedTasks, stationId)
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

const putEventResultsLambda = lambda('putEventResults', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const eventId = getParam(event, 'eventId')
  const submissions = parseSubmissions(event.body)

  if (submissions.length === 0) return response(422, 'no results', event)

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)
  const registrations = await getRegistrationsByEventId(eventId)

  // One timestamp for the batch, so every task saved together shares a version.
  const timestamp = new Date().toISOString()

  const patches: Patch<JsonRegistration>[] = []
  const saved: StoredEventResult[] = []
  const unchanged: StoredEventResult[] = []
  const conflicts: EventResultConflict[] = []

  for (const submission of submissions) {
    const registration = registrations.find((item) => item.id === submission.id)
    if (!registration) throw new LambdaError(404, `Registration '${submission.id}' not found`)

    const outcome = classifySubmission(confirmedEvent, registration, submission, timestamp, user.name)

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
      message: outcome.hadStored ? 'Muutti tulosta' : 'Tallensi tuloksen',
      user: user.name,
    })

    patches.push({ eventResult, id: submission.id })
    saved.push({ eventResult, id: submission.id })
  }

  // One broadcast for the batch: a class secretary saves a screenful at a time, and other open clients
  // should see the whole screenful rather than watch it arrive dog by dog.
  if (patches.length) await publishRegistrationPatches(eventId, patches, confirmedEvent.organizer.id)

  // The dogs that did not conflict are already written, so a resubmission only has to carry the ones
  // still in dispute — losing a screenful of work to one contested dog would be its own bug.
  if (conflicts.length) {
    return response(409, { conflicts, error: 'resultConflict', saved, unchanged }, event)
  }

  // `saved` empty with nothing in dispute means every result was already stored — the answer a retry
  // over a bad connection should get, so the UI can say so instead of implying it wrote something.
  return response(200, { conflicts, saved, unchanged }, event)
})

export default putEventResultsLambda
