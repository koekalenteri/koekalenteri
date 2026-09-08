import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'

const getAdminEventLambda = lambda('getAdminEvent', async (event) => {
  const { item } = await authorizeEvent(event, () => getParam(event, 'id'))

  return response(200, item, event)
})

export default getAdminEventLambda
