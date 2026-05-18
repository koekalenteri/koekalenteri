import { sanitizeDogEvent } from '../../lib/event'
import { getParam, lambda, response } from '../lib/lambda'
import { eventReadPort } from '../registration/api'

export const getEventLambda = async (event: APIGatewayProxyEvent) => {
  const id = getParam(event, 'id')
  const item = await eventReadPort.getConfirmedEvent(id)
  const publicEvent = sanitizeDogEvent(item)

  return response(200, publicEvent, event)
}

export default lambda('getEvent', getEventLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
