import type { JsonDogEvent } from '../../types'
import { withExerciseAddresses } from '../../lib/results'
import { authorizeEvent } from '../lib/eventAuth'
import { changedItemsSince, collectionCursor, parseDateParam } from '../lib/incremental'
import { getParam, lambda, response } from '../lib/lambda'
import { adminRegistrationResponse, getRegistrationEditToken } from '../lib/registration'
import { readEventRegistrations } from '../lib/repositories/registrationRepository'

/**
 * The rows as the admin pages read them: each with its edit token, and its scores by exercise (KOE-1665),
 * read through the event's layout, so no page reads a score stored by post.
 */
const withEditTokens = (event: JsonDogEvent, items: Awaited<ReturnType<typeof readEventRegistrations>>) =>
  Promise.all(
    (items ?? []).map(async (registration) =>
      adminRegistrationResponse(withExerciseAddresses(event, registration), getRegistrationEditToken(registration))
    )
  )

const getAdminRegistrationsLambda = lambda('getAdminRegistrations', async (event) => {
  const { eventId, item: dogEvent } = await authorizeEvent(event, () => getParam(event, 'eventId'))

  const since = parseDateParam(event.queryStringParameters?.since)
  const allItems = await readEventRegistrations(eventId)

  if (since) {
    const changed = changedItemsSince(allItems ?? [], since)
    const items = await withEditTokens(
      dogEvent,
      changed.filter((item) => item.state === 'ready')
    )

    return response(
      200,
      {
        cursor: collectionCursor(allItems ?? [], since),
        deletedIds: changed.filter((item) => item.state !== 'ready').map((item) => item.id),
        items,
      },
      event
    )
  }

  // filter out registrations that are pending payment
  const items = allItems?.filter((item) => item.state === 'ready')
  return response(200, await withEditTokens(dogEvent, items ?? []), event)
})

export default getAdminRegistrationsLambda
