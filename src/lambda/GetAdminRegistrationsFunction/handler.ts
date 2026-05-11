import { authorize } from '../lib/auth'
import { fixRegistrationGroups } from '../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'

const getAdminRegistrationsLambda = lambda('getAdminRegistrations', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const eventId = getParam(event, 'eventId')
  const allItems = await getRegistrationsByEventId(eventId)

  // filter out registrations that are pending payment
  const items = allItems?.filter((item) => item.state === 'ready')
  const itemsWithGroups = await fixRegistrationGroups(items ?? [], user)

  return response(200, itemsWithGroups, event)
})

export default getAdminRegistrationsLambda
