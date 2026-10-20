import { sanitizeDogEvent } from '../../lib/event'
import { getLiveEvent } from '../lib/event'
import { getParam, lambda, response } from '../lib/lambda'

const getEventLambda = lambda('getEvent', async (event) => {
  const id = getParam(event, 'id')
  const item = await getLiveEvent(id)
  const publicEvent = sanitizeDogEvent(item)

  return response(200, publicEvent, event)
})

export default getEventLambda
