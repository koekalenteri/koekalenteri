import { sanitizeDogEvent } from '../../lib/event'
import { getEvent } from '../lib/event'
import { getParam, lambda } from '../lib/lambda'
import { response } from '../lib/lambda'

const getEventLambda = lambda('getEvent', async (event) => {
  const id = getParam(event, 'id')
  const item = await getEvent(id)
  const publicEvent = sanitizeDogEvent(item)

  return response(200, publicEvent, event)
})

export default getEventLambda
