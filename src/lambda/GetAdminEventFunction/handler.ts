import { authorizeWithMemberOf } from '../auth/api'
import { eventRepository } from '../event/repository'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'

export const getAdminEventLambda = async (event: Parameters<typeof response>[2]) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const id = getParam(event, 'id')
  const item = await eventRepository.getById(id)

  if (!item) {
    throw new LambdaError(404, `Event with id '${id}' was not found`)
  }

  if (!user.admin && !memberOf.includes(item.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  return response(200, item, event)
}

export default lambda('getAdminEvent', getAdminEventLambda)
