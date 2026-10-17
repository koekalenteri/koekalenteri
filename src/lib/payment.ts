import type {
  CustomCost,
  DogEvent,
  EventState,
  JsonRegistration,
  JsonTransaction,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  PaymentBalanceRegistration,
  PaymentPicture,
  PaymentPictureStatus,
  PaymentTime,
  PaytrailRefusalBody,
  PublicDogEvent,
  Registration,
  RegistrationPlacement,
  RegistrationRefundAmounts,
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
  canRefund,
  getRegistrationClass,
  hasRefundableBalance,
  isMember,
  isPaymentReturned,
  isStarter,
  shouldSendInvitationToRegistration,
} from './registration'
import { capitalize } from './string'
import { isConfirmedEvent } from './typeGuards'
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

/** When the trial is paid for, all a payment decision reads of the event besides its fee. */
type PaymentTimeEvent = { paymentTime?: PaymentTime }

/** The trial's state, which says whether it asks for its fee at all (`isEventOpenForPayment`). */
type EventStateHolder = { state?: EventState }

/**
 * Whether the trial lets the entry pay as far as its place goes: paying at entry anyone may, paying
 * at confirmation only a place. The pay offer, the waiting text and the secretary's payment request
 * read this one rule (KOE-1526); PaymentCreate answers 403 by it when there is no place.
 */
export const isPaymentOpenForPlace = (event: PaymentTimeEvent, registration: RegistrationPlacement): boolean =>
  event.paymentTime !== 'confirmation' || isStarter(registration)

/**
 * Whether a fee paid at confirmation still waits for a place, which is what the pay offer reads: the
 * group says it, and a new entry has none (KOE-1526). The confirmation itself does not decide it: a
 * picked place may pay before confirming. A payment charged twice turns the offer off for its own
 * reason, so it says nothing of the place: it does not wait. The participant's pages read the
 * picture's status instead; this is the form's own reading for an entry with no picture yet.
 */
export const isPaymentWaitingForPlace = (
  event: PaymentTimeEvent,
  registration: RegistrationPlacement & Pick<Registration, 'paymentStatus'>
): boolean =>
  event.paymentTime === 'confirmation' && registration.paymentStatus !== 'DUPLICATE' && !isStarter(registration)

/**
 * Whether the place has been paid for. A trial that costs nothing has nothing to wait for, and a
 * part payment counts too: a missing remainder is the secretary's business, not the invitation's.
 * What counts is money still standing for the place: a payment refunded whole, or all but the
 * handling fee kept from it, has paid for nothing, so a reserve that had its fee back and is then
 * lifted into a place waits for its payment like any other (KOE-1526). A payment recorded before the
 * amounts were kept counts as paid, as it does for the balance. The picture's `paidForPlace`.
 */
export const isRegistrationPaid = (
  event: MinimalEventForCost,
  registration: MinimalRegistrationForCost & Pick<Registration, 'paymentStatus'> & RegistrationRefundAmounts
): boolean => hasStandingPayment(registration) || calculateCost(event, registration).amount <= 0

/**
 * Whether some payment still stands for the place: money paid and not gone back, or a payment
 * recorded before the amounts were kept. What the paid rule and the secretary's paid line read.
 */
export const hasStandingPayment = (
  registration: RegistrationRefundAmounts & Pick<Registration, 'paymentStatus'>
): boolean => isPaymentWithoutAmount(registration) || hasRefundableBalance(registration)

/** A registration as the participant's own pages hold it: no group, and the server's picture of its payment. */
export type ParticipantPaymentRegistration = PaymentBalanceRegistration & Pick<Registration, 'payment'>

/**
 * Whether the trial asks for its fee at all: only once it is confirmed. A tentative or a cancelled
 * trial asks nothing of anyone (KOE-1526). It is `isConfirmedEvent` on the state.
 */
export const isEventOpenForPayment = (event: EventStateHolder): boolean => isConfirmedEvent({ state: event.state })

/**
 * What the form shows as still owed, as it is edited: a paid entry cannot change its price in the
 * form (KOE-1070), so every entry reads its balance here and a change before paying shows at once
 * (KOE-722). Only a fee that went back takes the server's picture, as it needs the group the page
 * does not have: a reserve owes nothing, and owes the fee again once lifted into a place (KOE-1526).
 * A trial that is not confirmed yet shows no amount. Without a picture a returned fee reads as a
 * reserve's, as an entry with no group does everywhere: nothing owed.
 */
export const getShownPaymentDue = (event: PublicDogEvent, registration: ParticipantPaymentRegistration): number => {
  if (!isConfirmedEvent(event)) return 0
  return isPaymentReturned(registration) && registration.payment
    ? registration.payment.due
    : getPaymentBalance(event, registration).due
}

/** What the picture reads of a registration's open payment: whether it is still being worked on. */
export type OpenPayment = Pick<JsonTransaction, 'createdAt' | 'status' | 'statusAt' | 'type'>

/** Everything the picture reads of an entry: its money, its place and the payment's mark. */
type PictureRegistration = PaymentBalanceRegistration & { paidAt?: Date | string }

/** What the picture reads of the trial: its fee, when it is paid and whether it is confirmed. */
type PictureEvent = MinimalEventForCost & PaymentTimeEvent & EventStateHolder

const getPictureStatus = (
  event: PictureEvent,
  registration: PictureRegistration,
  { due, excess, inProgress }: { due: number; excess: number; inProgress: boolean }
): PaymentPictureStatus => {
  if (registration.paymentStatus === 'DUPLICATE') return 'duplicate'
  if (inProgress) return 'inProgress'
  if (isPaymentReturned(registration)) return due > 0 ? 'unpaid' : 'refunded'
  if (hasStandingPayment(registration)) {
    if (due > 0) return 'partial'
    return excess > 0 ? 'overpaid' : 'paid'
  }
  if (due <= 0) return 'notCharged'
  return isPaymentWaitingForPlace(event, registration) ? 'waitingForPlace' : 'unpaid'
}

/**
 * Where an entry's payment stands: one answer to what the icon, the tooltip, the status line, the
 * pay button, the payment page, PaymentCreate and the cancel dialog read (KOE-1530). It reads the
 * whole row, the group included, so it is worked out where the row is whole: the server sends it to
 * the participant, who never receives the group (KOE-1515). `openTransactions` are the registration's
 * open payment transactions, loaded; without them a payment in progress is invisible, so only a row
 * that has none to load (a fresh one) may pass an empty list.
 *
 * The status decides in this order, and the first that applies wins: a payment charged twice
 * (`duplicate`); a payment in progress; a fee that went back (`unpaid` when the place owes it again,
 * else `refunded`); money standing for the place (`partial` while a part is missing, `overpaid` above
 * the fee, else `paid`); nothing owed or a trial that is not confirmed (`notCharged`); a fee at
 * confirmation whose place is still awaited (`waitingForPlace`); else `unpaid`. What was paid
 * decides paid or part paid, not what the last payment attempt left (KOE-1526).
 */
export const getPaymentPicture = (
  event: PictureEvent,
  registration: PictureRegistration,
  openTransactions: readonly OpenPayment[]
): PaymentPicture => {
  const open = isEventOpenForPayment(event)
  const balance = getPaymentBalance(event, registration)
  const due = open ? balance.due : 0
  const inProgress = openTransactions.some(isPaymentInProgress)
  const held = inProgress || registration.paymentStatus === 'DUPLICATE'

  return {
    canPay: open && due > 0 && !held && isPaymentOpenForPlace(event, registration),
    canRefund: canRefund(registration),
    canRefundExcess: open && canRefundExcess(event, registration),
    due,
    excess: balance.excess,
    keptFee: registration.refundHandlingCost ?? 0,
    paidAmount: registration.paidAmount ?? 0,
    paidForPlace: isRegistrationPaid(event, registration),
    refundedAmount: registration.refundAmount ?? 0,
    standing: hasStandingPayment(registration),
    status: getPictureStatus(event, registration, { due, excess: balance.excess, inProgress }),
    unsettled: open && isPaymentUnsettled(event, registration),
  }
}

/** How long a payment may stay unfinished at Paytrail before it no longer counts as in progress. */
export const STALE_PENDING_PAYMENT_AGE_MS = 5 * 60 * 1000

export const isStalePendingPayment = (createdAt?: string, statusAt?: string) => {
  const timestamp = statusAt ?? createdAt
  if (!timestamp) return false

  const age = Date.now() - new Date(timestamp).getTime()
  return Number.isFinite(age) && age >= STALE_PENDING_PAYMENT_AGE_MS
}

/**
 * A payment Paytrail is still working on: a payment transaction, pending, younger than the stale
 * limit. What PaymentCreate answers 409 for, and the rule the payment picture applies to each
 * of a registration's open payments (KOE-1529, KOE-1530). A refund shares the payment's reference and is
 * never a payment in progress (KOE-1526).
 */
export const isPaymentInProgress = (
  transaction: Pick<JsonTransaction, 'createdAt' | 'status' | 'statusAt' | 'type'>
): boolean =>
  transaction.type === 'payment' &&
  transaction.status === 'pending' &&
  !isStalePendingPayment(transaction.createdAt, transaction.statusAt)

/**
 * Whether the secretary may send a payment request: the participant's pay offer, read from the
 * secretary's row (KOE-1526). That row is read without its open payments loaded (the secretary's list
 * does not BatchGet every registration's open transactions), so it never holds the request back on
 * its own; PaymentCreate decides when the link is actually opened, with a 409 for a payment truly in
 * progress. A duplicate still waits for its refund (KOE-1529).
 */
export const canRequestPaymentFor = (event: Partial<DogEvent>, row: PictureRegistration): boolean =>
  isConfirmedEvent(event) && getPaymentPicture(event, row, []).canPay

/**
 * Whether a paid fee no longer matches what the entry adds up to: a part missing or paid over. What
 * the secretary's payment mark turns amber for; a never-paid place is not unsettled, just unpaid.
 */
export const isPaymentUnsettled = (
  event: MinimalEventForCost,
  registration: PaymentBalanceRegistration & { paidAt?: Date | string }
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
  Pick<JsonRegistration | Registration, 'cancelled' | 'group' | 'paymentStatus'> &
  RegistrationRefundAmounts

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
  isStarter(registration) &&
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
