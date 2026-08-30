import { userHasAdminAccess } from '../../lib/user'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import { getLocationSnapshot } from '../lib/location'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// exported for testing
export const dynamoDB = new CustomDynamoClient(CONFIG.locationTable)

// Read-only on purpose: no KL credentials and no refresh parameter, so the hot path stays a single
// GetItem. RefreshLocationsFunction owns the writing, on a schedule and by manual invoke.
const getLocationsLambda = lambda('getLocations', async (event) => {
  const user = await authorize(event)
  if (!user || !userHasAdminAccess(user)) {
    return response(401, 'Unauthorized', event)
  }

  const snapshot = await getLocationSnapshot(dynamoDB)

  return response(200, snapshot?.items ?? [], event)
})

export default getLocationsLambda
