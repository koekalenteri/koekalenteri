import type { CustomCost, MinimalEventForCost, MinimalRegistrationForCost, Registration } from '../types'
import { additionalCost, calculateCost, getApplicableStrategy, getEarlyBirdDates, selectCost } from './cost'
import { isMember } from './registration'
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

export const getPaymentStatus = (
  registration: Pick<Registration, 'paymentStatus' | 'confirmed'>,
  event?: { paymentTime?: 'registration' | 'confirmation' }
) => {
  if (registration.paymentStatus === 'SUCCESS') return 'paymentStatus.success'
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
