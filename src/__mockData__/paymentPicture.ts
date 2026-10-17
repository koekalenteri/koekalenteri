import type { PaymentPicture, Registration } from '../types'
import { getPaymentPicture } from '../lib/payment'

/**
 * A payment picture with every key, a fee paid in full unless told otherwise: what a page test sets
 * when it pins what a page does with the server's answer, whatever the row beside it says.
 */
export const paymentPictureWith = (overrides: Partial<PaymentPicture> = {}): PaymentPicture => ({
  canPay: false,
  canRefund: false,
  canRefundExcess: false,
  due: 0,
  excess: 0,
  keptFee: 0,
  paidAmount: 123,
  paidForPlace: true,
  refundedAmount: 0,
  standing: true,
  status: 'paid',
  unsettled: false,
  ...overrides,
})

/** A registration as the participant receives it: with the picture the server works out from the whole row. */
export const withPaymentPicture = <T extends Registration>(
  event: Parameters<typeof getPaymentPicture>[0],
  registration: T
): T & { payment: PaymentPicture } => ({ ...registration, payment: getPaymentPicture(event, registration, []) })
