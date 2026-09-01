import type { JsonConfirmedEvent } from '../../types'
import { getEvent } from '../lib/event'
import { parseSubmissions, processResultSubmissions, stationScopedSubmission } from '../lib/eventResults'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
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

  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  const station = await authorizeStationEntry(event, eventId, confirmedEvent, stationId)

  const submissions = parseSubmissions(event.body, confirmedEvent).map((submission) =>
    stationScopedSubmission(submission, stationId)
  )
  if (submissions.length === 0) return response(422, 'no results', event)

  const registrations = await getRegistrationsByEventId(eventId)
  const { conflicts, patches, saved, unchanged } = await processResultSubmissions(
    eventId,
    confirmedEvent,
    registrations,
    submissions,
    `Rasti ${station.number}`
  )

  if (patches.length) await publishRegistrationPatches(eventId, patches, confirmedEvent.organizer.id)

  // Echo back only what this link may see: its own post's tasks, without the derived prize the
  // whole-round data would carry.
  const scope = (results: typeof saved) =>
    results.map((item) => ({ ...item, eventResult: scopeResultToStation(item.eventResult, stationId) }))
  const scopedConflicts = conflicts.map((conflict) => ({
    ...conflict,
    stored: scopeResultToStation(conflict.stored, stationId),
    submitted: scopeResultToStation(conflict.submitted, stationId),
  }))

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
