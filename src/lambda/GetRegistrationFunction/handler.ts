import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistration } from '../lib/registration'
import { eventReadPort } from '../registration/api'
import { composePublicRegistration } from '../registration/read'

export const getRegistrationLambda = async (event: APIGatewayProxyEvent) => {
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  if (!eventId || !id) {
    throw new LambdaError(404, 'not found')
  }

  const registration = await getRegistration(eventId, id)
  const dogEvent = await eventReadPort.getConfirmedEvent(eventId)
  const publicRegistration = await composePublicRegistration(eventId, id, registration, dogEvent)
  return response(200, publicRegistration, event)
}

export default lambda('getRegistration', getRegistrationLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
