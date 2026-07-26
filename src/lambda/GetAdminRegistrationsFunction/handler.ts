import { fixRegistrationGroups } from '../lib/event'
import { authorizeEvent } from '../lib/eventAuth'
import { changedItemsSince, collectionCursor, parseDateParam } from '../lib/incremental'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { getRegistrationEditToken, participantRegistrationResponse } from '../lib/registrationAccess'

const withEditTokens = (items: Awaited<ReturnType<typeof getRegistrationsByEventId>>) =>
  Promise.all(
    (items ?? []).map(async (registration) =>
      participantRegistrationResponse(registration, await getRegistrationEditToken(registration))
    )
  )

const getAdminRegistrationsLambda = lambda('getAdminRegistrations', async (event) => {
  const { eventId, user, res } = await authorizeEvent(event, () => getParam(event, 'eventId'))

  if (res) return res

  const since = parseDateParam(event.queryStringParameters?.since)
  const allItems = await getRegistrationsByEventId(eventId)

  if (since) {
    const changed = changedItemsSince(allItems ?? [], since)
    const fixedItems = await fixRegistrationGroups(
      changed.filter((item) => item.state === 'ready'),
      user
    )
    const items = await withEditTokens(fixedItems)

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
  return response(200, await withEditTokens(itemsWithGroups), event)
})

export default getAdminRegistrationsLambda
