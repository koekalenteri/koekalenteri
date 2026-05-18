import { authorize } from '../auth/api'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { fixRegistrationGroups } from '../registration/groups'

export const getAdminRegistrationsLambda = async (event: Parameters<typeof response>[2]) => {
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
}

export default lambda('getAdminRegistrations', getAdminRegistrationsLambda)
