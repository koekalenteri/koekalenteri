import type { Organizer } from '../../types'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)

const putOrganizerLambda = lambda('putOrganizer', async (event) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const item: Partial<Organizer> = parseJSONWithFallback(event.body)

  if (!item.id) {
    return response(400, 'no data', event)
  }

  const existing = await dynamoDB.read<Organizer>({ id: item.id })
  const updated = { ...existing, ...item }

  await dynamoDB.write(updated)
  await publishAdminDataInvalidation(['organizers'])

  return response(200, updated, event)
})

export default putOrganizerLambda
