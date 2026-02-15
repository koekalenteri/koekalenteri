import type { JsonRegistration } from '../../types'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { fixRegistrationGroups } from '../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.registrationTable)

const getAdminRegistrationsLambda = lambda('getAdminRegistrations', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const eventId = getParam(event, 'eventId')
  const allItems = await dynamoDB.query<JsonRegistration>({
    key: 'eventId = :eventId',
    values: { ':eventId': eventId },
  })

  // filter out registrations that are pending payment
  const items = allItems?.filter((item) => item.state === 'ready')
  const itemsWithGroups = await fixRegistrationGroups(items ?? [], user)

  return response(200, itemsWithGroups, event)
})

export default getAdminRegistrationsLambda
