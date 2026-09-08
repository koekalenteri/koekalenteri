import type {
  CustomCost,
  JsonRegistration,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  PaymentBalanceRegistration,
  Registration,
} from '../types'
import type { InvitationAttachmentEvent, InvitationAttachmentRegistration } from './registration'
import {
  additionalCost,
  calculateCost,
  getApplicableStrategy,
  getEarlyBirdDates,
  getPaymentBalance,
  selectCost,
} from './cost'
import { getEventStateForClass } from './event'
import {
  getRegistrationClass,
  getRegistrationGroupKey,
  hasRefundableBalance,
  isMember,
  isParticipantGroup,
  shouldSendInvitationToRegistration,
} from './registration'
import { capitalize } from './string'

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

/**
 * The key of what the entrant reads about the fee. `due` is what is still owed of a fee that has
 * been paid once: a member price paid by someone who was not a member (KOE-722) reads as a part
 * missing, not as paid.
 */
export const getPaymentStatus = (
  registration: Pick<Registration, 'paymentStatus' | 'confirmed'>,
  event?: { paymentTime?: 'registration' | 'confirmation' },
  due = 0
) => {
  if (registration.paymentStatus === 'SUCCESS') return due > 0 ? 'paymentStatus.partial' : 'paymentStatus.success'
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
 */
export const isRegistrationPaid = (
  event: MinimalEventForCost,
  registration: MinimalRegistrationForCost & Pick<Registration, 'paymentStatus'>
): boolean =>
  registration.paymentStatus === 'SUCCESS' ||
  (registration.paidAmount ?? 0) > 0 ||
  calculateCost(event, registration).amount <= 0

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
  Pick<JsonRegistration | Registration, 'cancelled' | 'group' | 'paymentStatus'>

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
