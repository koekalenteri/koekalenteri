import type {
  CustomCost,
  JsonRegistration,
  JsonTransaction,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  PaymentBalanceRegistration,
  PaytrailRefusalBody,
  Registration,
} from '../types'
import type { AuditActor } from './audit'
import type { InvitationAttachmentEvent, InvitationAttachmentRegistration } from './registration'
import {
  additionalCost,
  calculateCost,
  getApplicableStrategy,
  getEarlyBirdDates,
  getPaymentBalance,
  isPaymentWithoutAmount,
  selectCost,
} from './cost'
import { getEventStateForClass } from './event'
import {
  getRegistrationClass,
  getRegistrationGroupKey,
  hasRefundableBalance,
  isMember,
  isParticipantGroup,
  isPaymentReturned,
  shouldSendInvitationToRegistration,
} from './registration'
import { capitalize } from './string'
import { isObject } from './utils'

export const PROVIDER_NAMES: Record<string, string> = {
  aktia: 'Aktia',
  alandsbanken: 'Ålandsbanken',
  alisa: 'Alisa Yrityslasku',
  amex: 'American Express',
  'apple-pay': 'Apple Pay',
  collectorb2b: 'Walley B2B',
  collectorb2c: 'Walley',
  creditcard: 'Visa / Mastercard',
  'danske-business': 'Danske B2B',
  'email refund': 'Sähköposti + tilisiirto',
  handelsbanken: 'Handkesbanken',
  jousto: 'Jousto',
  mobilepay: 'MobilePay',
  nordea: 'Nordea',
  'nordea-business': 'Nordea B2B',
  omasp: 'OmaSP',
  'op-tililuotto': 'OP Tililuotto',
  oplasku: 'OP Lasku',
  osuuspankki: 'OP',
  paypal: 'PayPal',
  pivo: 'Pivo',
  pop: 'POP Pankki',
  saastopankki: 'Säästöpankki',
  siirto: 'Siirto',
  spankki: 'S-Pankki',
}

const hasName = (provider?: string): provider is keyof typeof PROVIDER_NAMES => !!provider && provider in PROVIDER_NAMES

export const getProviderName = (provider?: string) =>
  hasName(provider) ? PROVIDER_NAMES[provider] : capitalize(provider ?? '')

type PaymentStatusRegistration = Pick<
  Registration,
  'paymentStatus' | 'confirmed' | 'paidAmount' | 'refundAmount' | 'refundHandlingCost'
>

/**
 * A payment that went through: paid, a part of it missing, or given back. A fee that went back to a
 * reserve reads as refunded, not as paid, and as missing again once the place owes it (KOE-1526).
 */
const getSuccessfulPaymentStatus = (registration: PaymentStatusRegistration, due: number) => {
  if (isPaymentReturned(registration)) return due > 0 ? 'paymentStatus.missing' : 'paymentStatus.refunded'
  return due > 0 ? 'paymentStatus.partial' : 'paymentStatus.success'
}

/**
 * The key of what the entrant reads about the fee. `due` is what is still owed of a fee that has
 * been paid once: a member price paid by someone who was not a member (KOE-722) reads as a part
 * missing, not as paid.
 */
export const getPaymentStatus = (
  registration: PaymentStatusRegistration,
  event?: { paymentTime?: 'registration' | 'confirmation' },
  due = 0
) => {
  if (registration.paymentStatus === 'SUCCESS') return getSuccessfulPaymentStatus(registration, due)
  if (registration.paymentStatus === 'DUPLICATE') return 'paymentStatus.duplicate'
  if (registration.paymentStatus === 'PENDING') return 'paymentStatus.pending'
  // If payment is after confirmation and registration is not yet confirmed, show different message
  if (event?.paymentTime === 'confirmation' && !registration.confirmed) {
    return 'paymentStatus.waitingForConfirmation'
  }
  return 'paymentStatus.missing'
}

/**
 * Whether the place has been paid for. A trial that costs nothing has nothing to wait for, and a
 * part payment counts too: a missing remainder is the secretary's business, not the invitation's.
 * What counts is money still standing for the place: a payment refunded whole, or all but the
 * handling fee kept from it, has paid for nothing, so a reserve that had its fee back and is then
 * lifted into a place waits for its payment like any other (KOE-1526). A payment recorded before the
 * amounts were kept counts as paid, as it does for the balance.
 */
export const isRegistrationPaid = (
  event: MinimalEventForCost,
  registration: MinimalRegistrationForCost & Pick<Registration, 'paymentStatus' | 'refundAmount' | 'refundHandlingCost'>
): boolean =>
  isPaymentWithoutAmount(registration) ||
  hasRefundableBalance(registration) ||
  calculateCost(event, registration).amount <= 0

/** A registration as the participant's own pages hold it: no group, and the server's word on what is owed. */
export type ParticipantPaymentRegistration = PaymentBalanceRegistration & Pick<Registration, 'paidAt' | 'paymentDue'>

/**
 * What the participant still owes, as their own pages show it. Their responses leave out the group
 * the balance reads, so once something has been paid the server's `paymentDue` decides: a reserve
 * whose fee went back owes nothing, and owes it again once lifted into a place (KOE-1526). Before
 * a payment nothing can have gone back, and the fee as the form reads it now is the answer, so an
 * edit shows at once. A response from before the field falls back to the same reading.
 */
export const getParticipantPaymentDue = (
  event: MinimalEventForCost,
  registration: ParticipantPaymentRegistration
): number =>
  registration.paidAt && registration.paymentDue !== undefined
    ? registration.paymentDue
    : getPaymentBalance(event, registration).due

/**
 * Whether a paid fee no longer matches what the entry adds up to: a part missing or paid over. What
 * the secretary's payment mark turns amber for; a never-paid place is not unsettled, just unpaid.
 */
export const isPaymentUnsettled = (
  event: MinimalEventForCost,
  registration: PaymentBalanceRegistration & Pick<Registration, 'paidAt'>
): boolean => {
  if (!registration.paidAt) return false
  const { due, excess } = getPaymentBalance(event, registration)
  return due > 0 || excess > 0
}

/**
 * Whether the fee has been paid over, and the overpaid part can still be returned. Unlike the
 * ordinary refund this does not ask for a reserve or cancelled place: the participant who paid the
 * full price and was a member all along gets the difference back, after the trial too (KOE-1382).
 */
export const canRefundExcess = (
  event: MinimalEventForCost,
  registration: PaymentBalanceRegistration & Pick<Registration, 'refundHandlingCost'>
): boolean => hasRefundableBalance(registration) && getPaymentBalance(event, registration).excess > 0

type InvitationPaymentEvent = InvitationAttachmentEvent &
  MinimalEventForCost &
  Parameters<typeof getEventStateForClass>[0]

type InvitationPaymentRegistration = InvitationAttachmentRegistration &
  MinimalRegistrationForCost &
  Pick<JsonRegistration | Registration, 'cancelled' | 'group' | 'paymentStatus' | 'refundAmount' | 'refundHandlingCost'>

/**
 * Whether the koekutsu round has been sent for this registration: its own class is invited, or the
 * trial as a whole is. Both are what the group move reads when it decides to invite a dog it lifts.
 */
const isInvitedRound = (event: InvitationPaymentEvent, registration: InvitationPaymentRegistration): boolean =>
  event.state === 'invited' || getEventStateForClass(event, getRegistrationClass(registration)) === 'invited'

/**
 * Whether this participant is still owed the koekutsu of a round that has already gone out — the
 * dog lifted from the reserve list after the others were invited.
 */
const isInvitationDue = (event: InvitationPaymentEvent, registration: InvitationPaymentRegistration): boolean =>
  isParticipantGroup(getRegistrationGroupKey(registration)) &&
  isInvitedRound(event, registration) &&
  shouldSendInvitationToRegistration(event, registration)

/**
 * The koekutsu that the automatic send held back until the place is paid for (KOE-1191). The
 * secretary can still send it by hand; this only says what the trial is waiting for.
 */
export const isInvitationAwaitingPayment = (
  event: InvitationPaymentEvent,
  registration: InvitationPaymentRegistration
): boolean => isInvitationDue(event, registration) && !isRegistrationPaid(event, registration)

/** The same koekutsu once the money is in: what the payment callback sends. */
export const shouldSendInvitationAfterPayment = (
  event: InvitationPaymentEvent,
  registration: InvitationPaymentRegistration
): boolean => isInvitationDue(event, registration) && isRegistrationPaid(event, registration)

export const getRegistrationPaymentDetails = (event: MinimalEventForCost, registration: MinimalRegistrationForCost) => {
  const cost = selectCost(event, registration)
  const strategy = getApplicableStrategy(event, registration)

  if (typeof cost === 'number') {
    return {
      cost,
      isMember: isMember(registration),
      optionalCosts: [] as CustomCost[],
      strategy: 'legacy' as const,
      total: cost,
    }
  }

  const strategyCost = strategy.getValue(cost, registration.dog.breedCode)
  const optional = additionalCost(registration, cost)
  const optionalCosts = cost.optionalAdditionalCosts?.filter((_c, i) => registration.optionalCosts?.includes(i)) ?? []

  return {
    cost: strategyCost,
    costObject: cost,
    isMember: isMember(registration),
    optionalCosts,
    strategy: strategy.key,
    total: strategyCost + optional,
    translationOptions: {
      code: registration.dog.breedCode,
      ...getEarlyBirdDates(event, cost),
    },
  }
}

/** Whom a transaction's audit rows are attributed to: the user who started it, as it was recorded then. */
export const transactionActor = (transaction: Pick<JsonTransaction, 'user' | 'userSource'>): AuditActor => ({
  name: transaction.user ?? 'anonymous',
  ...(transaction.userSource ? { source: transaction.userSource } : {}),
})

/**
 * The `message` of a Paytrail error answered as JSON, or nothing when the answer was something else.
 * The payment page shows only this: any other error text it gets is the API's own (KOE-1511).
 */
export const paytrailErrorMessage = (error?: string): string | undefined => {
  if (!error) return undefined
  try {
    const details: unknown = JSON.parse(error)
    if (isObject(details) && typeof details.message === 'string' && details.message) return details.message
  } catch {
    // Not JSON: an HTML or plain answer, or the reason the request failed.
  }
  return undefined
}

/**
 * What Paytrail said of a refusal: its JSON `message`, else the text it answered with (an HTML or
 * plain 5xx, or why the request failed), else nothing (KOE-1511).
 */
export const paytrailErrorText = (error?: string): string | undefined =>
  paytrailErrorMessage(error) ?? (error === '' ? undefined : error)

/**
 * The answer PaymentCreate and RefundCreate give when Paytrail refuses: its own words as they came,
 * empty when it gave none, marked as Paytrail's. The payment page and the refund dialog build the
 * sentence in the reader's language (KOE-1511, KOE-1513).
 */
export const paytrailRefusalBody = (error?: string): PaytrailRefusalBody => ({
  error: error ?? '',
  provider: 'paytrail',
})

/**
 * A payment creation or refund answer that is Paytrail's refusal, as `paytrailRefusalBody` marks it,
 * not one of the API's own errors, which also answer `{ error }`. Read by PaymentPage and RefundDialog.
 */
export const isPaytrailRefusal = (body: unknown): body is PaytrailRefusalBody =>
  isObject(body) && body.provider === 'paytrail' && typeof body.error === 'string'
