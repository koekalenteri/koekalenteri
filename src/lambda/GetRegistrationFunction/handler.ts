import { getEvent } from '../lib/event'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getTransactionsByReference } from '../lib/payment'
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

  return response(200, registration, event)
})

export default getRegistrationLambda
