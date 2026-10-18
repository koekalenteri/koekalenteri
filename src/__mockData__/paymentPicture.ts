import type { ComponentType } from 'react'
import type { PaymentPicture, Registration } from '../types'
import { createElement } from 'react'
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

/** What a component that shows a row's payment is given besides the picture: the trial and the row. */
type RowPictureProps = {
  event: Parameters<typeof getPaymentPicture>[0]
  reg: Parameters<typeof getPaymentPicture>[1]
}

/**
 * A component that takes the row's payment picture as a prop, rendered the way RegistrationIcons
 * renders it: with the picture worked out from the `event` and `reg` it is given (KOE-1552). Name the
 * props without the picture: `withRowPaymentPicture<Omit<ComponentProps<typeof X>, 'payment'>>(X)`.
 */
export const withRowPaymentPicture =
  <P extends RowPictureProps>(Component: ComponentType<P & { payment: PaymentPicture }>) =>
  (props: P) =>
    createElement(Component, { ...props, payment: getPaymentPicture(props.event, props.reg, []) })
