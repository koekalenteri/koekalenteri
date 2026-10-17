import type { ClassOrNone, JsonConfirmedEvent } from '../../types'
import { resultsPublishedAudit } from '../../lib/audit'
import { getClassDays, uniqueClasses } from '../../lib/event'
import { isRegistrationClass } from '../../lib/registration'
import { isDayKey } from '../../types'
import { audit, eventAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent, setResultsPublishedState } from '../lib/event'
import { assertEventOrganizerAccess } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, httpError, lambda, response } from '../lib/lambda'
import { publishEventPatch } from '../lib/ws/actions'
import { publishPublicStartList } from '../lib/ws/publicStartList'

interface ResultsPublishedRequest {
  /** The class whose day is published or hidden; absent for a classless event. */
  eventClass?: string
  /** The one day (yyyy-MM-dd) the request is about. */
  date?: string
  published?: boolean
}

/**
 * The class the request names, checked against the event: one of its classes, or none for a classless
 * event. A class the event does not run has no days to publish.
 */
const requestedClass = (
  confirmedEvent: JsonConfirmedEvent,
  eventClass: ResultsPublishedRequest['eventClass']
): ClassOrNone => {
  const classes = uniqueClasses(confirmedEvent)
  if (classes.length === 0) {
    if (eventClass !== undefined) throw httpError(422, 'invalid class')
    return undefined
  }
  if (!isRegistrationClass(eventClass) || !classes.includes(eventClass)) throw httpError(422, 'invalid class')
  return eventClass
}

/**
 * The one endpoint that publishes or hides results, a day at a time (KOE-1510). A class running on two
 * days publishes each day on its own, so the second day's results stay off the web while they are
 * being entered. The request names its day and nothing else changes: the clock never adds a day.
 *
 * The publish is held to the same rules the panel greys its buttons by (KOE-1466); hiding is always
 * allowed.
 */
const putResultsPublishedLambda = lambda('putResultsPublished', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)

  const eventId = getParam(event, 'eventId')
  const body = parseJSONWithFallback<ResultsPublishedRequest>(event.body, {})
  if (typeof body.published !== 'boolean') throw httpError(422, 'nothing to do')
  const { published } = body

  // Read as last written: a secretary's quick hide and publish must not fold from the row before the hide.
  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId, true)
  assertEventOrganizerAccess(user, memberOf, confirmedEvent)
  const eventClass = requestedClass(confirmedEvent, body.eventClass)
  const date = body.date
  if (!isDayKey(date) || !getClassDays(confirmedEvent, eventClass).includes(date)) {
    throw httpError(422, 'invalid date')
  }

  // Held to the publishing rules, and on a conflict judged and folded again from the row as written.
  const saved = await setResultsPublishedState(confirmedEvent, { date, eventClass, published })

  await audit({
    auditKey: eventAuditKey(saved),
    ...resultsPublishedAudit(published, { date, eventClass }),
    user: user.name,
  })

  await publishEventPatch(
    { eventId, resultsPublished: saved.resultsPublished, updatedAt: saved.updatedAt },
    saved.organizer.id
  )
  // A result has no transport of its own: an open start list learns of it only as its rows rebuilt.
  await publishPublicStartList(eventId)

  return response(200, { event: saved }, event)
})

export default putResultsPublishedLambda
