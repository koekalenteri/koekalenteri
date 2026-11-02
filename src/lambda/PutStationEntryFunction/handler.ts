import type { JsonConfirmedEvent } from '../../types'
import { stationExercises } from '../../lib/resultTasks'
import { getLiveEvent } from '../lib/event'
import { parseSubmissions, processResultSubmissions, stationScopedSubmission } from '../lib/eventResults'
import { getParam, httpError, lambda, response } from '../lib/lambda'
import { readEventRegistrations } from '../lib/repositories/registrationRepository'
import { authorizeStationEntry, scopeResultToStation } from '../lib/stationEntry'
import { publishRegistrationPatches } from '../lib/ws/actions'

/**
 * Scores from the station's tokenized link. The same classification the event secretary's endpoint
 * runs, with two differences: the write is attributed to the post rather than a user, and the scope is
 * this one post — whatever the body claims, every submission is forced onto the path's station, and
 * the merge then drops any task naming another post.
 */
const putStationEntryLambda = lambda('putStationEntry', async (event) => {
  const eventId = getParam(event, 'eventId')
  const stationId = getParam(event, 'stationId')

  const confirmedEvent = await getLiveEvent<JsonConfirmedEvent>(eventId)
  const station = authorizeStationEntry(event, eventId, confirmedEvent, stationId)

  const submissions = parseSubmissions(event.body, confirmedEvent).map((submission) =>
    stationScopedSubmission(submission, stationId, confirmedEvent.eventType)
  )
  if (submissions.length === 0) throw httpError(422, 'no results')

  const registrations = await readEventRegistrations(eventId)
  const { conflicts, locked, patches, saved, unchanged } = await processResultSubmissions(
    eventId,
    confirmedEvent,
    registrations,
    submissions,
    `Suorituspaikka ${station.number}`
  )

  if (patches.length) await publishRegistrationPatches(eventId, patches, confirmedEvent.organizer.id)

  // Echo back only what this link may see: its own post's tasks, the exercises the dog's group does
  // here, without the derived prize the whole-round data would carry.
  const { eventType } = confirmedEvent
  const exercisesOf = (id: string) => {
    const registration = registrations.find((item) => item.id === id)
    return registration ? stationExercises(confirmedEvent, registration, stationId) : []
  }
  const scope = (results: typeof saved) =>
    results.map((item) => ({
      ...item,
      eventResult: scopeResultToStation(item.eventResult, exercisesOf(item.id), eventType),
    }))
  const scopedConflicts = conflicts.map((conflict) => ({
    ...conflict,
    stored: scopeResultToStation(conflict.stored, exercisesOf(conflict.id), eventType),
    submitted: scopeResultToStation(conflict.submitted, exercisesOf(conflict.id), eventType),
  }))

  if (locked) throw httpError(423, { error: 'resultsLocked', saved: scope(saved), unchanged: scope(unchanged) })

  if (conflicts.length) {
    return response(
      409,
      { conflicts: scopedConflicts, error: 'resultConflict', saved: scope(saved), unchanged: scope(unchanged) },
      event
    )
  }

  return response(200, { conflicts: scopedConflicts, saved: scope(saved), unchanged: scope(unchanged) }, event)
})

export default putStationEntryLambda
