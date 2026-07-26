import { authorizeEvent } from '../lib/eventAuth'
import { getParam, lambda, response } from '../lib/lambda'

const getAdminEventLambda = lambda('getAdminEvent', async (event) => {
  const { item, res } = await authorizeEvent(event, () => getParam(event, 'id'))

  if (res) return res

  return response(200, item, event)
})

export default getAdminEventLambda
