import { userHasAdminAccess } from '../../lib/user'
import { authorize } from '../lib/auth'
import { httpError, lambda, response } from '../lib/lambda'
import { readLocationSnapshot } from '../lib/repositories/locationRepository'

// Read-only on purpose: no KL credentials and no refresh parameter, so the hot path stays a single
// GetItem. RefreshLocationsFunction owns the writing, on a schedule and by manual invoke.
const getLocationsLambda = lambda('getLocations', async (event) => {
  const user = await authorize(event)
  if (!user || !userHasAdminAccess(user)) {
    throw httpError(401, 'Unauthorized')
  }

  const snapshot = await readLocationSnapshot()

  return response(200, snapshot?.items ?? [], event)
})

export default getLocationsLambda
