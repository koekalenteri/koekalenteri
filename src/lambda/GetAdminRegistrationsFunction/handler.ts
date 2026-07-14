import { authorize } from '../lib/auth'
import { fixRegistrationGroups } from '../lib/event'
import { changedItemsSince, collectionCursor, parseDateParam } from '../lib/incremental'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'

const getAdminRegistrationsLambda = lambda('getAdminRegistrations', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const eventId = getParam(event, 'eventId')
  const since = parseDateParam(event.queryStringParameters?.since)
  const allItems = await getRegistrationsByEventId(eventId)

  if (since) {
    const changed = changedItemsSince(allItems ?? [], since)
    const items = await fixRegistrationGroups(
      changed.filter((item) => item.state === 'ready'),
      user
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
  const itemsWithGroups = await fixRegistrationGroups(items ?? [], user)
  return response(200, itemsWithGroups, event)
})

export default getAdminRegistrationsLambda
