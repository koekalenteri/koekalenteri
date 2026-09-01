import type { JsonConfirmedEvent } from '../../types'
import { authorizeWithMemberOf } from '../lib/auth'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseSubmissions, processResultSubmissions } from '../lib/eventResults'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { publishRegistrationPatches } from '../lib/ws/actions'

const putEventResultsLambda = lambda('putEventResults', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const eventId = getParam(event, 'eventId')
  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)
  const submissions = parseSubmissions(event.body, confirmedEvent)

  if (submissions.length === 0) return response(422, 'no results', event)

  const registrations = await getRegistrationsByEventId(eventId)

  const { conflicts, patches, saved, unchanged } = await processResultSubmissions(
    eventId,
    confirmedEvent,
    registrations,
    submissions,
    user.name
  )

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
