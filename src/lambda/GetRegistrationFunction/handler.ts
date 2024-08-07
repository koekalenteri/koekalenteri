import { getEvent } from '../lib/event'
import { getParam, lambda, LambdaError } from '../lib/lambda'
import { getRegistration } from '../lib/registration'
import { response } from '../utils/response'

const getRegistrationLambda = lambda('getRegistration', async (event) => {
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  if (!eventId || !id) {
    throw new LambdaError(404, 'not found')
  }

  const registration = await getRegistration(eventId, id)

  // Make sure not to leak information to user
  delete registration.group
  delete registration.internalNotes

  const dogEvent = await getEvent(eventId)
  registration.invitationAttachment = dogEvent?.invitationAttachment

  return response(200, registration, event)
})

export default getRegistrationLambda
