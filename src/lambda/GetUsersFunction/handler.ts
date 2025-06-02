import { authorize } from '../lib/auth'
import { lambda } from '../lib/lambda'
import { response } from '../lib/lambda'
import { filterRelevantUsers, getAllUsers, userIsMemberOf } from '../lib/user'

const getUsersLambda = lambda('getUsers', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const memberOf = userIsMemberOf(user)
  if (!memberOf.length && !user?.admin) {
    console.error(`User ${user.id} is not admin or member of any organizations.`)
    return response(403, 'Forbidden', event)
  }
  const users = await getAllUsers()

  return response(200, filterRelevantUsers(users, user, memberOf), event)
})

export default getUsersLambda
