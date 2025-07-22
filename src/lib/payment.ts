import type { CustomCost, MinimalEventForCost, MinimalRegistrationForCost, Registration } from '../types'

import { capitalize } from '../lambda/lib/string'

import { additionalCost, getApplicableStrategy, getEarlyBirdEndDate, selectCost } from './cost'
import { isMember } from './registration'

export const PROVIDER_NAMES: Record<string, string> = {
  'apple-pay': 'Apple Pay',
  'danske-business': 'Danske B2B',
  'email refund': 'Sähköposti + tilisiirto',
  'nordea-business': 'Nordea B2B',
  'op-tililuotto': 'OP Tililuotto',
  aktia: 'Aktia',
  alandsbanken: 'Ålandsbanken',
  alisa: 'Alisa Yrityslasku',
  amex: 'American Express',
  collectorb2b: 'Walley B2B',
  collectorb2c: 'Walley',
  creditcard: 'Visa / Mastercard',
  handelsbanken: 'Handkesbanken',
  jousto: 'Jousto',
  mobilepay: 'MobilePay',
  nordea: 'Nordea',
  omasp: 'OmaSP',
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

export const getPaymentStatus = (registration: Pick<Registration, 'paymentStatus'>) => {
  if (registration.paymentStatus === 'SUCCESS') return 'paymentStatus.success'
  if (registration.paymentStatus === 'PENDING') return 'paymentStatus.pending'
  return 'paymentStatus.missing'
}

export const getRegistrationPaymentDetails = (event: MinimalEventForCost, registration: MinimalRegistrationForCost) => {
  const cost = selectCost(event, registration)
  const strategy = getApplicableStrategy(event, registration)

  if (typeof cost === 'number') {
    return {
      strategy: 'legacy' as const,
      isMember: isMember(registration),
      cost,
      optionalCosts: [] as CustomCost[],
      total: cost,
    }
  }

  const strategyCost = strategy.getValue(cost, registration.dog.breedCode)
  const optional = additionalCost(registration, cost)
  const optionalCosts = cost.optionalAdditionalCosts?.filter((c, i) => registration.optionalCosts?.includes(i)) ?? []

  return {
    strategy: strategy.key,
    isMember: isMember(registration),
    cost: strategyCost,
    optionalCosts,
    total: strategyCost + optional,
    translationOptions: {
      code: registration.dog.breedCode,
      start: event.entryStartDate,
      end: getEarlyBirdEndDate(event, cost),
    },
  }
}
