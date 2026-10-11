import type { JsonConfirmedEvent, RegistrationClass } from '../../types'
import { resultsPublishedAudit } from '../../lib/audit'
import { getClassDays, uniqueClasses } from '../../lib/event'
import { getResultsBlocker } from '../../lib/publishing'
import { isRegistrationClass } from '../../lib/registration'
import { audit, eventAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { setResultsPublishedState } from '../lib/event'
import { getAuthorizedEvent } from '../lib/eventAuth'
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
): RegistrationClass | undefined => {
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

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)
  const eventClass = requestedClass(confirmedEvent, body.eventClass)
  const date = body.date
  if (typeof date !== 'string' || !getClassDays(confirmedEvent, eventClass).includes(date)) {
    throw httpError(422, 'invalid date')
  }

  if (published) {
    const reason = getResultsBlocker(confirmedEvent, eventClass, date)
    if (reason) throw httpError(422, { error: 'publishBlocked', eventClass, publish: 'results', reason })
  }

  const state = await setResultsPublishedState(confirmedEvent, { date, eventClass, published })
  confirmedEvent.resultsPublished = state.resultsPublished
  confirmedEvent.updatedAt = state.updatedAt

  await audit({
    auditKey: eventAuditKey(confirmedEvent),
    ...resultsPublishedAudit(published, { date, eventClass }),
    user: user.name,
  })

  await publishEventPatch(
    { eventId, resultsPublished: confirmedEvent.resultsPublished, updatedAt: confirmedEvent.updatedAt },
    confirmedEvent.organizer.id
  )
  // A result has no transport of its own: an open start list learns of it only as its rows rebuilt.
  await publishPublicStartList(confirmedEvent)

  return response(200, { event: confirmedEvent }, event)
})

export default putResultsPublishedLambda
