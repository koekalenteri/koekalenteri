import type {
  CustomCost,
  EventState,
  JsonTransaction,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  PaymentBalanceRegistration,
  PaymentPicture,
  PaymentPictureStatus,
  PaymentTime,
  PaytrailRefusalBody,
  Registration,
  RegistrationPlacement,
} from '../types'
import type { AuditActor } from './audit'
import {
  additionalCost,
  calculateCost,
  getApplicableStrategy,
  getEarlyBirdDates,
  getPaymentBalance,
  isPaymentWithoutAmount,
  selectCost,
} from './cost'
import { canRefund, hasRefundableBalance, isMember, isPaymentReturned, isStarter } from './registration'
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
 * Whether the trial asks for its fee at all: only once it is confirmed. A tentative or a cancelled
 * trial asks nothing of anyone (KOE-1526). It is `isConfirmedEvent` on the state.
 */
export const isEventOpenForPayment = (event: EventStateHolder): boolean => isConfirmedEvent({ state: event.state })

/** What the picture reads of a registration's open payment: whether it is still being worked on. */
export type OpenPayment = Pick<JsonTransaction, 'createdAt' | 'status' | 'statusAt' | 'type'>

/** Everything the picture reads of an entry: its money, its place and the payment's mark. */
type PictureRegistration = PaymentBalanceRegistration & { paidAt?: Date | string }

/** What the picture reads of the trial: its fee, when it is paid and whether it is confirmed. */
type PictureEvent = MinimalEventForCost & PaymentTimeEvent & EventStateHolder

/** What the status reads besides the row: the amounts, and whether money is held or standing. */
type PictureStatusFacts = { due: number; excess: number; inProgress: boolean; standing: boolean }

const getPictureStatus = (
  event: PictureEvent,
  registration: PictureRegistration,
  { due, excess, inProgress, standing }: PictureStatusFacts
): PaymentPictureStatus => {
  if (registration.paymentStatus === 'DUPLICATE') return 'duplicate'
  if (inProgress) return 'inProgress'
  if (isPaymentReturned(registration)) return due > 0 ? 'unpaid' : 'refunded'
  if (standing) {
    if (due > 0) return 'partial'
    return excess > 0 ? 'overpaid' : 'paid'
  }
  if (due <= 0) return 'notCharged'
  // A fee paid at confirmation waits for a place: the group says it, and a new entry has none
  // (KOE-1526). The confirmation itself does not decide it: a picked place may pay before confirming.
  return isPaymentOpenForPlace(event, registration) ? 'unpaid' : 'waitingForPlace'
}

/**
 * Where an entry's payment stands: one answer to what the icon, the tooltip, the status line, the
 * pay button, the payment page, PaymentCreate, the cancel dialog and the secretary's views read
 * (KOE-1530, KOE-1552). It reads the whole row, the group included, so it is worked out where the
 * row is whole: the server sends it to the participant, who never receives the group (KOE-1515), and
 * the secretary's views work it out from the row they show. `openTransactions` are the
 * registration's open payment transactions, loaded; without them a payment in progress is
 * invisible, so only a row that has none to load (a fresh one, the secretary's) may pass an empty list.
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
  // Some payment still stands for the place: money paid and not gone back, or a payment recorded
  // before the amounts were kept.
  const standing = isPaymentWithoutAmount(registration) || hasRefundableBalance(registration)

  return {
    canPay: open && due > 0 && !held && isPaymentOpenForPlace(event, registration),
    canRefund: canRefund(registration),
    // Unlike the ordinary refund this asks for no reserve or cancelled place, and for no confirmed
    // trial either: the overpaid part is the entrant's after the trial and in a cancelled one too
    // (KOE-1382, KOE-1552). The secretary's mark and menu add the confirmed trial themselves.
    canRefundExcess: hasRefundableBalance(registration) && balance.excess > 0,
    due,
    excess: balance.excess,
    keptFee: registration.refundHandlingCost ?? 0,
    paidAmount: registration.paidAmount ?? 0,
    // A trial that costs nothing has nothing to wait for, and a part payment counts too: a missing
    // remainder is the secretary's business, not the invitation's. A payment refunded whole, or all
    // but the handling fee, has paid for nothing (KOE-1526).
    paidForPlace: standing || calculateCost(event, registration).amount <= 0,
    refundedAmount: registration.refundAmount ?? 0,
    standing,
    status: getPictureStatus(event, registration, { due, excess: balance.excess, inProgress, standing }),
    // A paid fee that no longer matches what the entry adds up to: a part missing or paid over. A
    // never-paid place is not unsettled, just unpaid.
    unsettled: open && Boolean(registration.paidAt) && (balance.due > 0 || balance.excess > 0),
  }
}

/** A row as a page holds it: the participant's carries the server's picture, the secretary's and a new entry's do not. */
export type PaymentPictureRow = PictureRegistration & Pick<Registration, 'payment'>

/**
 * The picture a page shared by the participant and the secretary reads: the server's, which the
 * participant's row carries, or the one worked out from the row, which is whole for the secretary
 * and for a new entry (KOE-1552).
 */
export const getRowPaymentPicture = (event: PictureEvent, row: PaymentPictureRow): PaymentPicture =>
  row.payment ?? getPaymentPicture(event, row, [])

/** What the form says of the payment: the amount owed and whether paying it waits for a place. */
type FormPayment = { due: number; waitsForPlace: boolean }

/**
 * What the form shows as still owed, and whether paying it waits for a place, as the row is edited.
 * A paid entry cannot change its price in the form (KOE-1070), so the amount is read from the edited
 * row and a change before paying shows at once (KOE-722). The one exception is a fee that went back
 * on the participant's row: only the server knows the group, and read without it the row is a
 * reserve's, owing nothing, so the server's picture says what is owed (KOE-1526). Whether paying
 * waits is read from the picture the pay offer reads: nothing owed waits for nothing, and otherwise
 * paying at confirmation waits while the link is not offered and no payment is held.
 */
export const getFormPayment = (event: PictureEvent, row: PaymentPictureRow): FormPayment => {
  const picture = getRowPaymentPicture(event, row)
  const due =
    row.payment && isPaymentReturned(row) && isEventOpenForPayment(event)
      ? row.payment.due
      : getPaymentPicture(event, row, []).due
  const held = picture.status === 'inProgress' || picture.status === 'duplicate'

  return { due, waitsForPlace: due > 0 && event.paymentTime === 'confirmation' && !picture.canPay && !held }
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
