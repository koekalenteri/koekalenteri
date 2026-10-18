import type { Organizer } from '../../types'
import { authorizeAdmin } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { saveOrganizer } from '../lib/repositories/organizerRepository'
import { publishAdminDataInvalidation } from '../lib/ws/actions'

const putOrganizerLambda = lambda('putOrganizer', async (event) => {
  await authorizeAdmin(event)

  const item: Partial<Organizer> = parseJSONWithFallback(event.body)

  if (!item.id) {
    throw httpError(400, 'no data')
  }

  const updated = await saveOrganizer({ ...item, id: item.id })
  await publishAdminDataInvalidation(['organizers'])

  return response(200, updated, event)
})

export default putOrganizerLambda
