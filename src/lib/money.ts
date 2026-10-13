import type { Registration } from '../types'

const currency = 'EUR'
const moneyFormatter = Intl.NumberFormat('fi-FI', { currency, style: 'currency' })
const moneyCodeFormatter = Intl.NumberFormat('fi-FI', { currency, currencyDisplay: 'code', style: 'currency' })

export const formatMoney = (amount: number) => moneyFormatter.format(amount)
export const formatMoneyWithoutCurrency = (amount: number) =>
  moneyCodeFormatter.format(amount).replace(currency, '').trim()

/** An amount in whole cents, so sums of amounts compare exactly. */
export const toCents = (amount: number) => Math.round(amount * 100)

/**
 * What the entrant has paid towards the fee: what was paid, less what was refunded (KOE-1460) and
 * less the handling fee kept from a refund. That fee is the price of the refund, never a payment
 * towards the place (KOE-1526): an overpaid part refunded less a fee leaves the fee settled, and a
 * reserve lifted into a place after its fee went back owes all of it. Counted in cents, so a refund
 * and a fee that add up to the payment leave nothing.
 */
export const getNetPaidAmount = (
  registration: Pick<Registration, 'paidAmount' | 'refundAmount' | 'refundHandlingCost'>
): number =>
  (toCents(registration.paidAmount ?? 0) -
    toCents(registration.refundAmount ?? 0) -
    toCents(registration.refundHandlingCost ?? 0)) /
  100
