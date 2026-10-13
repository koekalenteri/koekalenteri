import type {
  CustomCost,
  DogEvent,
  EventState,
  JsonRegistration,
  JsonTransaction,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  PaymentBalanceRegistration,
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
  getRegistrationClass,
  getRegistrationGroupKey,
  hasRefundableBalance,
  isMember,
  isParticipantGroup,
  isPaymentReturned,
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

/** What the pay offer reads: the server's word on the participant's pages, the group on the secretary's. */
type PayOfferRegistration = RegistrationPlacement & Pick<Registration, 'paymentStatus' | 'shouldPay'>

/**
 * Whether the trial lets the entry pay as far as its place goes: paying at entry anyone may, paying
 * at confirmation only a place. The pay offer, the waiting text and the secretary's payment request
 * read this one rule (KOE-1526).
 */
export const isPaymentOpenForPlace = (event: PaymentTimeEvent, registration: RegistrationPlacement): boolean =>
  event.paymentTime !== 'confirmation' || isParticipantGroup(getRegistrationGroupKey(registration))

/**
 * A payment in progress, or one charged twice: either holds the pay offer back, place or no place.
 * A stored PENDING means a payment in progress only once the server has read its transactions
 * (`getParticipantRow`): the participant's state is built from such a row (KOE-1526).
 */
const isPaymentHeld = (registration: Pick<Registration, 'paymentStatus'>): boolean =>
  registration.paymentStatus === 'PENDING' || registration.paymentStatus === 'DUPLICATE'

type PaymentStatusRegistration = RegistrationRefundAmounts & PayOfferRegistration

/**
 * Whether a fee paid at confirmation still waits for a place, which is what the pay offer reads: the
 * participant's pages have the server's `shouldPay`, the secretary's the group, and a new entry
 * neither (KOE-1526). The confirmation itself does not decide it: a picked place may pay before
 * confirming. A payment in progress or charged twice turns the offer off for its own reason, so it
 * says nothing of the place: it does not wait.
 */
export const isPaymentWaitingForPlace = (event: PaymentTimeEvent, registration: PayOfferRegistration): boolean => {
  if (event.paymentTime !== 'confirmation' || isPaymentHeld(registration)) return false
  return !(registration.shouldPay ?? isPaymentOpenForPlace(event, registration))
}

/**
 * The key of what the entrant reads about the fee. `due` is what is still owed: a member price paid
 * by someone who was not a member (KOE-722) reads as a part missing, not as paid. What was paid
 * decides paid or part paid, not what the last payment attempt left (KOE-1526): a payment of the rest
 * abandoned or cancelled at Paytrail leaves the fee part paid. A fee that went back reads as
 * refunded, and as missing once the place owes it again. Nothing owed, a free trial say, or a trial
 * that is not confirmed, reads as not charged: neither missing nor waiting.
 */
export const getPaymentStatus = (
  registration: PaymentStatusRegistration,
  event?: PaymentTimeEvent & EventStateHolder,
  due = 0
) => {
  if (registration.paymentStatus === 'DUPLICATE') return 'paymentStatus.duplicate'
  if (registration.paymentStatus === 'PENDING') return 'paymentStatus.pending'
  if (isPaymentReturned(registration)) return due > 0 ? 'paymentStatus.missing' : 'paymentStatus.refunded'
  if (hasStandingPayment(registration)) return due > 0 ? 'paymentStatus.partial' : 'paymentStatus.success'
  if (due <= 0 || (event && !isEventOpenForPayment(event))) return 'paymentStatus.notCharged'
  if (event && isPaymentWaitingForPlace(event, registration)) return 'paymentStatus.waitingForConfirmation'
  return 'paymentStatus.missing'
}

export type PaymentStatusKey = ReturnType<typeof getPaymentStatus>

/**
 * Whether the status line reads as paid, which the euro sign beside it shows too: a fee paid in full
 * or in part. A fee that went back is not paid, whatever the payment's own status (KOE-1526).
 */
export const isPaidStatus = (status: PaymentStatusKey): boolean =>
  status === 'paymentStatus.success' || status === 'paymentStatus.partial'

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
  registration: MinimalRegistrationForCost & Pick<Registration, 'paymentStatus'> & RegistrationRefundAmounts
): boolean => hasStandingPayment(registration) || calculateCost(event, registration).amount <= 0

/**
 * Whether some payment still stands for the place: money paid and not gone back, or a payment
 * recorded before the amounts were kept. What the paid rule and the secretary's paid line read.
 */
export const hasStandingPayment = (
  registration: RegistrationRefundAmounts & Pick<Registration, 'paymentStatus'>
): boolean => isPaymentWithoutAmount(registration) || hasRefundableBalance(registration)

/** A registration as the participant's own pages hold it: no group, and the server's word on what is owed. */
export type ParticipantPaymentRegistration = PaymentBalanceRegistration & Pick<Registration, 'paymentDue'>

/**
 * What the participant still owes, as their own pages show it. Their responses leave out the group,
 * and the group matters only for a fee that went back: a reserve owes nothing, and owes the fee again
 * once lifted into a place (KOE-1526). That is the server's `paymentDue`, taken as it is: a paid entry
 * cannot change its price in the form (KOE-1070), so nothing on the page moves it. Every other entry
 * reads its balance here, so a change in the form before paying shows at once (KOE-722). Every
 * participant response and payment patch carries the field; a secretary's row has the group and reads
 * its own balance. Without either, a fee that went back reads as a reserve's, as an entry with no
 * group does everywhere: nothing owed.
 */
export const getParticipantPaymentDue = (
  event: MinimalEventForCost,
  registration: ParticipantPaymentRegistration
): number =>
  isPaymentReturned(registration) && registration.paymentDue !== undefined
    ? registration.paymentDue
    : getPaymentBalance(event, registration).due

/**
 * Whether the trial asks for its fee at all: only once it is confirmed. A tentative or a cancelled
 * trial asks nothing of anyone (KOE-1526). It is `isConfirmedEvent` on the state; the page's shown due
 * and the secretary's payment request call `isConfirmedEvent` itself, as they need the narrowed event.
 */
export const isEventOpenForPayment = (event: EventStateHolder): boolean => isConfirmedEvent({ state: event.state })

/**
 * What the participant's own pages show as still owed. A trial that is not confirmed yet shows no
 * amount, as the server's state says (`isEventOpenForPayment`).
 */
export const getShownPaymentDue = (event: PublicDogEvent, registration: ParticipantPaymentRegistration): number =>
  isConfirmedEvent(event) ? getParticipantPaymentDue(event, registration) : 0

/**
 * What the participant's payment line shows: the amount still owed, and the status it reads as.
 * InfoBox, RegistrationList and PaymentPage take both from here.
 */
export const getShownPayment = (
  event: PublicDogEvent,
  registration: ParticipantPaymentRegistration & PaymentStatusRegistration
): { due: number; status: PaymentStatusKey } => {
  const due = getShownPaymentDue(event, registration)
  return { due, status: getPaymentStatus(registration, event, due) }
}

/**
 * Whether the participant's pages offer paying, on the status box and on the dog's row alike: the
 * server's `shouldPay`, which only it can decide as it reads the group (KOE-1526). Not while a
 * payment is being verified, and not for a payment charged twice, whatever a stale answer says.
 */
export const isPaymentOffered = (
  registration: Pick<Registration, 'paymentStatus' | 'shouldPay'>,
  paymentVerificationInProgress: boolean
): boolean =>
  Boolean(registration.shouldPay) && registration.paymentStatus !== 'DUPLICATE' && !paymentVerificationInProgress

/**
 * Whether the participant is offered the payment link: the balance owes something. Whatever a
 * payment attempt left, a cancelled one say, does not decide it (KOE-1526). A payment in progress is
 * waited for, a payment charged twice waits for its refund, and paying at confirmation waits for a
 * place. GetRegistration and the payment patches ask this alike, so the pay button does not come and
 * go.
 */
export const shouldParticipantPay = (
  event: PaymentTimeEvent,
  registration: RegistrationPlacement & Pick<Registration, 'paymentStatus'>,
  due: number
): boolean => {
  if (registration.cancelled || due <= 0 || isPaymentHeld(registration)) return false
  return isPaymentOpenForPlace(event, registration)
}

/** What the participant's pages read of the fee: what is still owed, and whether to offer the payment link. */
interface ParticipantPaymentState {
  paymentDue: number
  shouldPay: boolean
}

/**
 * The participant's payment state, decided from the whole row: both parts read the group, which the
 * participant never receives (KOE-1515), so they go out in its place (KOE-1526). Every response and
 * payment patch to the participant takes it from here.
 */
export const getParticipantPaymentState = (
  event: MinimalEventForCost & PaymentTimeEvent & EventStateHolder,
  registration: PaymentBalanceRegistration
): ParticipantPaymentState => {
  if (!isEventOpenForPayment(event)) return { paymentDue: 0, shouldPay: false }
  const paymentDue = getPaymentBalance(event, registration).due
  return { paymentDue, shouldPay: shouldParticipantPay(event, registration, paymentDue) }
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
 * limit. What PaymentCreate answers 409 for, and the only thing a stored PENDING may stand for
 * (`getParticipantRow`). A refund shares the payment's reference and is never a payment in progress
 * (KOE-1526).
 */
export const isPaymentInProgress = (
  transaction: Pick<JsonTransaction, 'createdAt' | 'status' | 'statusAt' | 'type'>
): boolean =>
  transaction.type === 'payment' &&
  transaction.status === 'pending' &&
  !isStalePendingPayment(transaction.createdAt, transaction.statusAt)

/**
 * A row whose stored PENDING is not a payment in progress, as the pay offer reads it: NEW, payable
 * again (KOE-1526). The server uses it once the transactions show no payment in progress
 * (`getParticipantRow`); the secretary's request for any PENDING, having no transactions to read.
 */
export const asPaymentNotInProgress = <T extends Pick<Registration, 'paymentStatus'>>(row: T): T =>
  row.paymentStatus === 'PENDING' ? { ...row, paymentStatus: 'NEW' } : row

/**
 * Whether the secretary may send a payment request: the participant's pay offer, read from the
 * secretary's row (KOE-1526). That row has no transactions to tell a payment in progress from one
 * left at Paytrail, so a stored PENDING does not hold the request back; PaymentCreate decides when
 * the link is opened, with a 409 for a payment truly in progress. A duplicate waits for its refund.
 */
export const canRequestPaymentFor = (event: Partial<DogEvent>, row: PaymentBalanceRegistration): boolean =>
  isConfirmedEvent(event) && getParticipantPaymentState(event, asPaymentNotInProgress(row)).shouldPay

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
