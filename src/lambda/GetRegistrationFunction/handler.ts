import type { JsonConfirmedEvent } from '../../types'
import { isEventOver } from '../../lib/event'
import { getSentInvitationAttachment, isStarter } from '../../lib/registration'
import { getLiveEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { participantResponse } from '../lib/payment'
import { authorizeRegistrationRead, getRegistration } from '../lib/registration'

const getRegistrationLambda = lambda('getRegistration', async (event) => {
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  if (!eventId || !id) {
    throw new LambdaError(404, 'not found')
  }

  const storedRegistration = await getRegistration(eventId, id)
  const editToken = authorizeRegistrationRead(event, storedRegistration)
  const registration = { ...storedRegistration }
  const dogEvent = await getLiveEvent<JsonConfirmedEvent>(eventId)
  if (isEventOver(dogEvent)) {
    throw new LambdaError(404, 'not found')
  }

  if (isStarter(registration)) {
    registration.invitationAttachment = getSentInvitationAttachment(dogEvent, registration)
    registration.invitationAttachmentUpdatedAt = registration.invitationAttachment
      ? dogEvent.invitationAttachmentHistory?.[registration.invitationAttachment]?.uploadedAt
      : undefined
  }

  // A paid place can still owe: the fee rose after it was paid (KOE-722), and the payment link
  // charges the difference. A reserve whose fee went back owes nothing until it has a place, which
  // only the group tells, so the due and the pay button go out with the response (KOE-1526). The
  // group and the other fields a participant must not see are left out last: the derivations read
  // them.
  return response(200, await participantResponse(registration, editToken, dogEvent), event)
})

export default getRegistrationLambda
