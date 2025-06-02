import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent } from '../lib/event'
import { getParam, lambda, LambdaError } from '../lib/lambda'
import { response } from '../lib/lambda'

const getAdminEventLambda = lambda('getAdminEvent', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const id = getParam(event, 'id')
  const item = await getEvent(id)

  if (!user.admin && !memberOf.includes(item.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  return response(200, item, event)
})

export default getAdminEventLambda
