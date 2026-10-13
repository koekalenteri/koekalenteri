import type { JsonConfirmedEvent } from '../../types'
import { isEventOver } from '../../lib/event'
import { getSentInvitationAttachment, isParticipantGroup } from '../../lib/registration'
import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getParticipantRow } from '../lib/payment'
import { authorizeRegistrationRead, getRegistration, participantRegistrationResponse } from '../lib/registration'

const getRegistrationLambda = lambda('getRegistration', async (event) => {
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  if (!eventId || !id) {
    throw new LambdaError(404, 'not found')
  }

  const storedRegistration = await getRegistration(eventId, id)
  const editToken = authorizeRegistrationRead(event, storedRegistration)
  // A payment left at Paytrail is not in progress: the row reads as the payment state needs it.
  const registration = { ...(await getParticipantRow(storedRegistration)) }
  const dogEvent = await getEvent<JsonConfirmedEvent>(eventId)
  if (isEventOver(dogEvent)) {
    throw new LambdaError(404, 'not found')
  }

  if (isParticipantGroup(registration.group?.key)) {
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
  return response(200, participantRegistrationResponse(registration, editToken, dogEvent), event)
})

export default getRegistrationLambda
