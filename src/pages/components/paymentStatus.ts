import type { PaymentPictureStatus } from '../../types'

/** The words a payment picture's status is shown as, in the participant's pages. */
export const PAYMENT_STATUS_KEY = {
  duplicate: 'paymentStatus.duplicate',
  inProgress: 'paymentStatus.pending',
  notCharged: 'paymentStatus.notCharged',
  overpaid: 'paymentStatus.success',
  paid: 'paymentStatus.success',
  partial: 'paymentStatus.partial',
  refunded: 'paymentStatus.refunded',
  unpaid: 'paymentStatus.missing',
  waitingForPlace: 'paymentStatus.waitingForConfirmation',
} as const satisfies Record<PaymentPictureStatus, string>

/**
 * Whether the status line reads as paid, which the euro sign beside it shows too: a fee paid in full,
 * over or in part. A fee that went back is not paid, whatever the payment's own status (KOE-1526).
 */
export const isPaidPaymentStatus = (status: PaymentPictureStatus): boolean =>
  status === 'paid' || status === 'overpaid' || status === 'partial'
