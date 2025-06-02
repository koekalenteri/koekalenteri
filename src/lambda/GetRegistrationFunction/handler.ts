import { getEvent } from '../lib/event'
import { getParam, lambda, LambdaError } from '../lib/lambda'
import { response } from '../lib/lambda'
import { getRegistration, isParticipantGroup } from '../lib/registration'

const getRegistrationLambda = lambda('getRegistration', async (event) => {
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  if (!eventId || !id) {
    throw new LambdaError(404, 'not found')
  }

  const registration = await getRegistration(eventId, id)
  const dogEvent = await getEvent(eventId)

  if (isParticipantGroup(registration.group?.key)) {
    registration.invitationAttachment = dogEvent?.invitationAttachment
  }

  // Make sure not to leak information to user
  delete registration.group
  delete registration.internalNotes

  return response(200, registration, event)
})

export default getRegistrationLambda
