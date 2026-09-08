import type { Organizer } from '../../types'
import { CONFIG } from '../config'
import { authorizeAdmin } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)

const putOrganizerLambda = lambda('putOrganizer', async (event) => {
  await authorizeAdmin(event)

  const item: Partial<Organizer> = parseJSONWithFallback(event.body)

  if (!item.id) {
    throw httpError(400, 'no data')
  }

  const existing = await dynamoDB.read<Organizer>({ id: item.id })
  const updated = { ...existing, ...item }

  await dynamoDB.write(updated)
  await publishAdminDataInvalidation(['organizers'])

  return response(200, updated, event)
})

export default putOrganizerLambda
