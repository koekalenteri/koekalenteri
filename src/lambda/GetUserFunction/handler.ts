import { userHasAdminAccess } from '../../lib/user'
import { authorize } from '../lib/auth'
import { getDataVersions } from '../lib/dataVersions'
import { lambda, response } from '../lib/lambda'

const getUserLambda = lambda('getUser', async (event) => {
  const user = await authorize(event, true)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const dataVersions = userHasAdminAccess(user) ? await getDataVersions(user) : undefined

  return response(200, { ...user, dataVersions }, event)
})

export default getUserLambda
