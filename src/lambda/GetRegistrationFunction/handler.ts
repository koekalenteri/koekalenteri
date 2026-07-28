import { getSentInvitationAttachment, isParticipantGroup } from '../../lib/registration'
import { isEventOver } from '../../lib/utils'
import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getTransactionsByReference } from '../lib/payment'
import { getRegistration } from '../lib/registration'
import { authorizeRegistrationRead, participantRegistrationResponse } from '../lib/registrationAccess'

const getRegistrationLambda = lambda('getRegistration', async (event) => {
  const eventId = getParam(event, 'eventId')
  const id = getParam(event, 'id')
  if (!eventId || !id) {
    throw new LambdaError(404, 'not found')
  }

  const storedRegistration = await getRegistration(eventId, id)
  const editToken = await authorizeRegistrationRead(event, storedRegistration)
  const registration = { ...storedRegistration }
  const dogEvent = await getEvent(eventId)
  if (isEventOver({ endDate: new Date(dogEvent.endDate) })) {
    throw new LambdaError(404, 'not found')
  }

  if (isParticipantGroup(registration.group?.key)) {
    registration.invitationAttachment = getSentInvitationAttachment(dogEvent, registration)
    registration.invitationAttachmentUpdatedAt = registration.invitationAttachment
      ? dogEvent.invitationAttachmentHistory?.[registration.invitationAttachment]?.uploadedAt
      : undefined
  }

  if (registration.paymentStatus === 'PENDING') {
    const transactions = await getTransactionsByReference(`${eventId}:${id}`)
    const hasNew = transactions?.some((tx) => tx.status === 'new')
    if (hasNew) {
      registration.paymentStatus = 'NEW'
    }
  }

  if (!registration.cancelled) {
    const shouldPay = registration.paymentStatus !== 'SUCCESS' && registration.paymentStatus !== 'PENDING'

    if (dogEvent.paymentTime === 'confirmation') {
      registration.shouldPay = isParticipantGroup(registration?.group?.key) && shouldPay
    } else {
      registration.shouldPay = shouldPay
    }
  }

  // Make sure not to leak information to user
  delete registration.group
  delete registration.internalNotes

  return response(200, participantRegistrationResponse(registration, editToken), event)
})

export default getRegistrationLambda
