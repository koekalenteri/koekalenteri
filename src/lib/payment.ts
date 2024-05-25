import { capitalize } from '../lambda/lib/string'

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

const hasName = (provider: string): provider is keyof typeof PROVIDER_NAMES => provider in PROVIDER_NAMES

export const getProviderName = (provider: string) =>
  hasName(provider) ? PROVIDER_NAMES[provider] : capitalize(provider ?? '')
