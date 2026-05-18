import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { isParticipantGroup } from '../lib/registration'
import { paymentTransactionRepository } from '../payment/repository'

export const composePublicRegistration = async (
  eventId: string,
  id: string,
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent
): Promise<JsonRegistration> => {
  const next: JsonRegistration = { ...registration }

  if (isParticipantGroup(next.group?.key)) {
    next.invitationAttachment = confirmedEvent?.invitationAttachment
  }

  if (next.paymentStatus === 'PENDING') {
    const transactions = await paymentTransactionRepository.listByReference(`${eventId}:${id}`)
    if (transactions?.some((tx) => tx.status === 'new')) {
      next.paymentStatus = 'NEW'
    }
  }

  if (!next.cancelled) {
    const shouldPay = next.paymentStatus !== 'SUCCESS' && next.paymentStatus !== 'PENDING'
    next.shouldPay =
      confirmedEvent.paymentTime === 'confirmation' ? isParticipantGroup(next.group?.key) && shouldPay : shouldPay
  }

  delete next.group
  delete next.internalNotes
  return next
}
