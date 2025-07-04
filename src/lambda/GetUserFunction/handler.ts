import { authorize } from '../lib/auth'
import { lambda, response } from '../lib/lambda'

const getUserLambda = lambda('getUser', async (event) => {
  const user = await authorize(event, true)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  return response(200, user, event)
})

export default getUserLambda
