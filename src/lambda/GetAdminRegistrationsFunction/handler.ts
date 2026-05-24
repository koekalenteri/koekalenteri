import { authorize } from '../lib/auth'
import { fixRegistrationGroups } from '../lib/event'
import { changedSince, parseDateParam } from '../lib/incremental'
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

  // filter out registrations that are pending payment
  const items = allItems?.filter((item) => item.state === 'ready')
  const itemsWithGroups = await fixRegistrationGroups(items ?? [], user)

  if (since) {
    const { changed: registrations, unchangedIds } = changedSince(itemsWithGroups, since)

    return response(200, { registrations, unchangedIds }, event)
  }

  return response(200, itemsWithGroups, event)
})

export default getAdminRegistrationsLambda
